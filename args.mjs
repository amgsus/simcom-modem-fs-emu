/*
 * Author: A.G.
 *   Date: 2021/08/07
 */

import Commander from "commander";

const args = (function () {
    Commander
        .requiredOption("-s <serial_port>",
            "serial port on which emulator runs")
        .option("-b <baud_rate>",
            "serial baud rate", 115200)
        .option("-d <path>",
            "path to directory where distribution files are located", "files")
        .option("--no-cfsinit",
            "do not require CFSINIT command", false)
        .option("-v",
            "enable debug output", false)
        ;
    Commander.parse(process.argv);
    return Commander.opts();
})();

export default args;
