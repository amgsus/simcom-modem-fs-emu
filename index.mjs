/*
 * Author: A.G.
 *   Date: 2021/08/07
 */

import {
    resolve as resolvePath,
    join as joinPath
} from "path";

import {
    readFile,
    stat as statFile
} from "fs/promises";

import * as SerialPort     from "serialport";
import * as ReadlineParser from "@serialport/parser-readline";
import Joi                 from "joi";

import {
    execRegExpGroups,
    parseParameters,
    validateParameters,
    unescapeFileName
} from "./utils.mjs";

import args from "./args.mjs";

const PATH_INDICES = [ "custapp", "fota", "datatx", "customer" ];

const AT_PARSING_REGEX = new RegExp(/^(?:AT\+)(?<command>[\w]*)=?(?<value>.*)$/);

const CFSGFIS_PARSER = Object.seal({
    fields: [ "dirIndex", "fileName" ],
    validationSchema: Joi.object({
        dirIndex:   Joi.number().min(0).max(3).required(),
        fileName:   Joi.string().min(1).max(230).required()
    }).required()
});

const CFSRFILE_PARSER = Object.seal({
    fields: [ "dirIndex", "fileName", "mode", "bufferSize", "offset" ],
    validationSchema: Joi.object({
        dirIndex:   Joi.number().integer().min(0).max(3).required(),
        fileName:   Joi.string().min(1).max(230).required(),
        mode:       Joi.number().integer().min(0).max(1).required(),
        bufferSize: Joi.number().integer().min(0).max(10240).required(),
        offset:     Joi.number().integer().min(0).required(),
    }).required()
});

const HANDLER_MAP = {
    "CFSINIT" : handleInit,
    "CFSTERM" : handleTerminate,
    "CFSGFIS" : handleGetFileSize,
    "CFSRFILE": handleReadFile
};

const CRLF_BUFFER           = Buffer.from("\r\n", "ascii");
const OK_RESPONSE_BUFFER    = Buffer.from("\r\nOK\r\n", "ascii");
const ERROR_RESPONSE_BUFFER = Buffer.from("\r\nERROR\r\n", "ascii");

// -------------------------------------------------------------------- Main ---

let g_fsInited = false;

// Main.
((async () => {
    verbose(`>`, args);
    verbose(`> Opening %s at %d bauds...`, args.s, args.b);
    let portSettings = {
        baudRate: args.b
    };
    let serialPort = new SerialPort.default(args.s, portSettings, (err) => {
        if (err) {
            console.error(err);
        } else {
            startFileSystemEmulator(serialPort);
        }
    });
})());

function startFileSystemEmulator(serialPort) {
    let path = resolvePath(args.d);
    verbose(`> Start sharing files from '%s'...`, path);
    serialPort.pipe(new ReadlineParser.default({ delimiter: '\r' })).on('data', processInput.bind(this, serialPort, path));
}

// ------------------------------------------------------------- AT Handlers ---

async function processInput(serial, distPath, line) {
    verbose(`${line}`);
    let at = parseATCommand(line.trimLeft()); // Trim left to drop '\n' from previous command line and trailing spaces (tested with a real device).
    if (at) {
        let handler = HANDLER_MAP[at.command];
        if (handler) {
            at.input = line;
            try {
                let buffers = await handler(at, serial);
                buffers = buffers.map((x) => x instanceof Buffer ? x : Buffer.from(x, "ascii")); // Convert all to instances of Buffer.
                let echo = Buffer.from(`${at.input}\r`, "ascii");
                let response = Buffer.concat([ echo, ...buffers ]);
                serial.write(response);
                verbose(`OK`);
            } catch (err) {
                serial.write(`${at.input}\r`);
                serial.write(ERROR_RESPONSE_BUFFER);
                verbose(`ERROR: ${err.message}`);
            }
        }
    }
}

function parseATCommand(line) {
    return execRegExpGroups(AT_PARSING_REGEX, line, null, null);
}

function handleInit(at) {
    if (args.cfsinit && g_fsInited) {
        throw new Error(`CFSINIT has been called more than once`);
    }
    checkNoParameters(at);
    g_fsInited = true;
    return [
        OK_RESPONSE_BUFFER
    ];
}

function handleTerminate(at) {
    checkCFSINIT(at.command);
    checkNoParameters(at);
    g_fsInited = false;
    return [
        OK_RESPONSE_BUFFER
    ];
}

async function handleGetFileSize(at) {
    checkCFSINIT(at.command);
    let params = parseParameters(CFSGFIS_PARSER, at.value);
    let {
        dirIndex,
        fileName
    } = validateParameters(CFSGFIS_PARSER.validationSchema, params);
    fileName = unescapeFileName(fileName);
    let path = getFilePathFromDistribution(dirIndex, fileName);
    verbose(`> Getting size of '${path}'...`);
    let stat = await statFile(path);
    return [
        `\r\n+${at.command}: ${stat.size}\r\n`,
        OK_RESPONSE_BUFFER
    ];
}

async function handleReadFile(at) {
    checkCFSINIT(at.command);
    let params = parseParameters(CFSRFILE_PARSER, at.value);
    let {
        dirIndex,
        fileName,
        mode,
        bufferSize,
        offset
    } = validateParameters(CFSRFILE_PARSER.validationSchema, params);
    fileName = unescapeFileName(fileName);
    let path = getFilePathFromDistribution(dirIndex, fileName);
    verbose(`> Reading '${path}'...`);
    let fileContents = await readFile(path);
    let portion = ((() => {
        if (mode) {
            let fileSize = Buffer.byteLength(fileContents);
            if (offset >= fileSize) {
                throw new Error(`Offset is out of range (offset: ${offset}, size: ${fileSize})`);
            }
            return fileContents.slice(offset, offset + bufferSize);
        } else {
            return fileContents.slice(0, bufferSize);
        }
    })());
    let portionSize = Buffer.byteLength(portion);
    return [
        `\r\n+${at.command}: ${portionSize}\r\n`,
        portion,
        CRLF_BUFFER,
        OK_RESPONSE_BUFFER
    ];
}

function checkCFSINIT(issuedCommand) {
    if (args.cfsinit) {
        if (!g_fsInited) {
            throw new Error(`CFSINIT must precede call to ${issuedCommand}`);
        }
    }
}

function checkNoParameters(at) {
    if (at.value) {
        throw new Error(`${at.command} does not expect any parameters`);
    }
}

// ------------------------------------------------------------------- Utils ---

function getFilePathFromDistribution(index, fileName) {
    let dist = resolvePath(args.d);
    return joinPath(dist, PATH_INDICES[index], fileName);
}

function verbose(...s) {
    if (args.v) console.log(...s);
}
