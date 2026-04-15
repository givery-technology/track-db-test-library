"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.text = void 0;
exports.add = add;
exports.message = message;
const fs = __importStar(require("fs"));
const yaml_1 = require("yaml");
const i18n_buildin_1 = __importDefault(require("./i18n-buildin"));
const lang = process.env.CHALLENGE_LANGUAGE || 'ja';
let langMap = {};
add(i18n_buildin_1.default[lang]);
add(`locale/${lang}.yml`);
exports.text = tagify(getLangMap);
function getLangMap(t) {
    const candidate = langMap[t];
    return typeof candidate === 'undefined' ? t : candidate;
}
function tagify(fn) {
    return function (strings, ...values) {
        if (typeOf(strings) === 'string') {
            return fn(strings);
        }
        else {
            return String.raw({ raw: strings.raw.map((s) => fn(s)) }, ...values.map((s) => fn(s)));
        }
    };
}
function loadFromFile(path) {
    try {
        return (0, yaml_1.parse)(fs.readFileSync(path, 'utf8')) || {};
    }
    catch (_) {
        return {};
    }
}
function add(target) {
    switch (typeOf(target)) {
        case 'string':
            Object.assign(langMap, loadFromFile(target));
            break;
        case 'object':
            Object.assign(langMap, target);
            break;
    }
}
function typeOf(x) {
    return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}
function message(msg) {
    if (!!msg) {
        if (typeof msg === 'string') {
            return getLangMap(msg);
        }
        else {
            const m = msg[lang];
            return !!m ? m : Object.values(msg)[0];
        }
    }
    return undefined;
}
