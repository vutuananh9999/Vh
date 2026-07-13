import * as fs from "fs";
let data = fs.readFileSync("./services/geminiService.ts", "utf8");
data = data.replace(/const MODEL_PRO = 'gemini-3\.1-pro-preview';\nconst MODEL_FLASH = 'gemini-3\.5-flash';/, "const getPro = () => localStorage.getItem('aetheria_model_pro') || 'gemini-3.1-pro-preview';\nconst getFlash = () => localStorage.getItem('aetheria_model_flash') || 'gemini-3.5-flash';");
data = data.replace(/const ai = new GoogleGenAI\({ apiKey: process\.env\.API_KEY }\);/, "class DynamicAI {\n  get models() { return new GoogleGenAI({ apiKey: localStorage.getItem('aetheria_api_key') || process.env.GEMINI_API_KEY || '' }).models; }\n  get chats() { return new GoogleGenAI({ apiKey: localStorage.getItem('aetheria_api_key') || process.env.GEMINI_API_KEY || '' }).chats; }\n}\nconst ai = new DynamicAI() as unknown as GoogleGenAI;");
data = data.replace(/MODEL_PRO/g, "getPro()");
data = data.replace(/MODEL_FLASH/g, "getFlash()");
data = data.replace(/getPro\(\):/g, "MODEL_PRO:"); // fix for object keys or something? Wait, there are none in grep.
data = data.replace(/const getPro\(\) =/g, "const getPro ="); // wait
data = data.replace(/const getFlash\(\) =/g, "const getFlash ="); // wait
fs.writeFileSync("./services/geminiService.ts", data);
