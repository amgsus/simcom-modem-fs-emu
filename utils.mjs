/*
 * Author: A.G.
 *   Date: 2019/11/15
 */

export function execRegExpGroups(regexp, s, _default_ = null, cb = null) {
    if (typeof s !== "string") {
        throw new TypeError("Input is not a string");
    }
    let match = regexp.exec(s);
    let result = match ? match.groups : _default_;
    if ((typeof cb === "function") && (match !== null)) {
        try {
            let userResult = cb(result);
            if (typeof userResult !== "undefined") {
                return userResult;
            }
        } catch (e) {
            console.error(e);
        }
    }
    return result;
}

export function toHex(value, digits = 2) {
    if (typeof value === "number") {
        let hex = value.toString(16).toUpperCase().padStart(digits, "0");
        return `0x${hex}`;
    }
    return "";
}

export function parseParameters(parser, input) {
    let params = `${input}`.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
    return parser.fields.reduce((accum, fieldName, i) => {
        accum[fieldName] = i < params.length ? params[i] : null
        return accum;
    }, {});
}

export function validateParameters(schema, input, throwsErrorOnInvalid = true) {
    let { value, error } = schema.validate(input);
    return error ? throwsErrorOnInvalid ? ((() => { throw error })()) : null : value;
}

export function unescapeFileName(filename) {
    return `${filename}`.replace(/"([^"]+(?="))"/g, '$1');
}
