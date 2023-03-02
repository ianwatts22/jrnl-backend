"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const sendblue_1 = __importDefault(require("sendblue"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const body_parser_1 = __importDefault(require("body-parser"));
const openai_1 = require("openai");
const cron_1 = __importDefault(require("cron"));
const os_1 = __importDefault(require("os"));
const app = (0, express_1.default)();
const sendblue = new sendblue_1.default(process.env.SENDBLUE_API_KEY, process.env.SENDBLUE_API_SECRET);
const configuration = new openai_1.Configuration({ organization: process.env.OPENAI_ORGANIZATION, apiKey: process.env.OPENAI_API_KEY, });
const openai = new openai_1.OpenAIApi(configuration);
let hostname, link;
if (os_1.default.hostname().split('.').pop() === 'local') {
    hostname = '127.0.0.1', link = process.env.NGROK;
}
else {
    hostname = '0.0.0.0', link = 'https://jrnl.onrender.com';
}
const PORT = Number(process.env.PORT);
app.listen(PORT, hostname, () => { console.log(`server at http://${hostname}:${PORT}/`); });
app.use(express_1.default.static('public'));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(body_parser_1.default.json());
app.use((0, morgan_1.default)('dev'));
// ========================================================================================
// ========================================DATABASE========================================
// ========================================================================================
// PostgreSQL db
let clientConfig; // need to pass ssl: true for external access
process.env.PGHOST.includes('render') ? clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true } : clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) };
const client = new pg_1.Client(clientConfig);
const prisma = new client_1.PrismaClient();
client.connect();
function log_user(user) {
    return __awaiter(this, void 0, void 0, function* () {
        yield prisma.users.create({ data: user });
        send_message({ content: `NEW USER: ${user.name} ${user.number}`, number: admin_numbers.join() });
    });
}
function log_message(message) {
    return __awaiter(this, void 0, void 0, function* () { yield prisma.messages.create({ data: message }); });
}
// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================
app.post('/signup-form', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const t0 = Date.now();
        let fields = req.body.data.fields;
        res.status(200).end();
        let user = { name: fields[0].value, number: fields[1].value, timezone: fields[2].value.options.find((option) => option.id === fields[2].value).text };
        let existing_user = yield get_user(user.number);
        if (!existing_user) {
            send_message({ content: `Hi I'm jrnl, your conversational AI journal. We're trying to  Reply to my questions or text me when you want. I messsage every 3 hours throughout the day, Feel free to react to messages to better train me. Everything operates on natural language, so no need to learn any fancy commands. Your 'bio' provides me insight, helping me help you. Ask to view it or change it anytime. Remember, no special commands just speak as you would Add the contact card and pin me in your messages for quick access.`, media_url: `https://ianwatts22.github.io/jrnl/assets/jrnl.vcf`, number: user.number, send_style: 'laser' });
        }
        log_user(user);
        console.log(`${Date.now() - t0}ms - /signup-form: ${user.name} ${user.number}`);
    }
    catch (e) {
        res.status(500).end();
        error_alert(e);
    }
}));
app.post('/message', (req, res) => {
    try {
        const t0 = Date.now();
        const message = { content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: Number(req.body.group_id) };
        res.status(200).end();
        analyze_message(message, req.body.accountEmail);
        console.log(`${Date.now() - t0}ms - /message: (${message.number})`);
    }
    catch (e) {
        res.status(500).end();
        error_alert(e);
    }
});
app.post('/message-status', (req, res) => {
    try {
        const t0 = Date.now();
        const message_status = req.body;
        res.status(200).end();
        console.log(`${Date.now() - t0}ms - /message-status`);
    }
    catch (e) {
        res.status(500).end();
        error_alert(e);
    }
});
// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================
// test()
function test() {
    return __awaiter(this, void 0, void 0, function* () {
    });
}
// ======================================================================================
// ========================================FUNCTIONS=====================================
// ======================================================================================
const job = new cron_1.default.CronJob('55 */1 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    const t0 = new Date().getHours(), times = [9, 12, 3, 6, 9], timezones = ['PST', 'MST', 'CST', 'EST'];
    const users_with_timezone = yield prisma.users.findMany({ where: { timezone: { not: null } } });
    users_with_timezone.forEach(user => {
        if (times.includes(t0 + timezones.indexOf(user.timezone))) {
            format_text({ content: '', number: user.number });
        }
    });
}));
job.start();
function analyze_message(message, accountEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        const t0 = Date.now();
        if (!message.content || !message.number) {
            return;
        }
        yield log_message(message);
        const content_lc = message.content.toLowerCase();
        const reactions = ['liked', 'disliked', 'emphasized', 'laughed at', 'loved'];
        if (reactions.some(reaction => content_lc.startsWith(reaction))) {
            return;
        }
        if (content_lc.includes('admin message\n###') && admin_numbers.includes(message.number)) {
            send_message({ content: message.content.split('###').pop(), number: message.number });
            return;
        }
        let previous_messages = yield get_previous_messages(message, 6);
        const categories = ['discuss', 'update_profile', 'customer_support'];
        const categorize = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const category_response = yield openai.createCompletion({
                    model: 'text-davinci-003', temperature: 0.3,
                    prompt: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}.  Customer support is ONLY for people asking specifically about how the service works. Examples:\nText: I need help planning my day\nCategory: discuss\nText: what's my bio\nCategory: update_profile\nText: change my hometown to Ann Arbor\nCategory: update_profile\nText: how does this app work\nCategory: customer_support\nSome of your previous conversation is included below for context###${previous_messages}###\nText: ${message.content}\nCategory:`
                });
                return (_a = category_response.data.choices[0].text) === null || _a === void 0 ? void 0 : _a.toLowerCase().replace(/\s/g, '');
            }
            catch (e) {
                return null;
            }
        });
        const category = yield categorize();
        console.log(`category_lc: ${category}`);
        if (!category || !categories.includes(category)) {
            error_alert(` ! miscategorization (${message.number}): '${message.content}'\ncategory: ${category}`);
            yield send_message({ content: `sorry bugged out, try again`, number: message.number });
            return;
        }
        if (category.includes('discuss')) {
            format_text(message);
        }
        else if (category.includes('update_profile')) {
            const user = yield get_user(message.number);
            let openAIResponse = yield openai.createCompletion({
                model: 'text-davinci-003', max_tokens: 512, temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0,
                prompt: `Below is a message from the user along with their bio. We believe they to view their existing bio or update it. First determine their intent (view or update), then return either their existing or updated bio. If their bio is blank, put "empty". Previous messages are included which may help. Condense the information, remove extraneous words. Replace many words with few. Group relevant information. Separate disparate information with new lines. Format the bio like the following example, extracting the key words from the message.\n###\nExample bio:\n- from Los Angeles\n- studied mechanical engineering\n- polymath\n###\nRespond in the following format: <view or update>:<bio>\nBio:\n${user ? user.bio : ''}\nMessage: ${message.content}\nResponse:`
            });
            const response = openAIResponse.data.choices[0].text.split(':');
            console.log(response);
            yield send_message({ content: `${response[0].toLowerCase().replace(/\s/g, '') == 'view' ? 'your bio:' : 'updated bio:'}\n${response[1]}`, number: message.number });
            yield prisma.users.update({ where: { number: message.number }, data: { bio: response[1] } });
        }
        else if (category.includes('customer_support')) {
            let openAIResponse = yield openai.createCompletion({
                model: 'text-davinci-003', max_tokens: 256, temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
                prompt: `You are customer support for a conversational AI text-message journaling service called 'jrnl'. Since it's texts, keep responses brief and casual. Answer questions specifically, without extraneious information. Speak in few words, casually. The following is a description of the product/service\n- jrnl is meant to make journaling easier than ever, lowering the barriers by making it casual and conversational\n- you can add information to your bio to provide the bot with a better understanding of you\n- signup link: https://tally.so/r/w4Q7kX\nConversation:\n###\n
      Text: ${message.content}\nResponse:`
            });
            yield send_message({ content: openAIResponse.data.choices[0].text, number: message.number });
        }
        console.log(`${Date.now() - t0}ms - analyze_message`);
    });
}
function format_text(message) {
    return __awaiter(this, void 0, void 0, function* () {
        let init_prompt = `CONTEXT (DO NOT MENTION)\ntoday: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
You are a chatbot used to ask questions about someones life. You are to act as a way for the user to easily journal their life, helping them record their emotions and day to day life. You are kind, empathetic, and supportive, but are willing to ask hard questions and hold people accountable. Try to reflect who they are, acting as a mirror for people to better see and understand themselves.

LIMITATIONS:
You have no internet access, and may get specific facts wrong. 

GUIDELINES: 
Be inquisitive about a person's day, their activities, how they feel emotionally.
Ask people to expand on things if they are not clear.
Be curious about things they say.
Ask them to be specific.
Speak casually (contractions, slang, emojis ok).
Be friendly.
Avoid repeating information.
Be reassuring when replying to negative comments.
Do not provide or mention links to the internet.

A bio of the user is provided below for you to better understand who they are and empathize with them.`;
        const user = yield get_user(message.number);
        let previous_messages = yield get_previous_messages(message);
        let prompt = `${init_prompt}\n${user.bio}\n###\n${previous_messages}\n[${new Date().toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true })}] Journal:`;
        console.log(prompt);
        respond_text(message, prompt);
    });
}
function get_previous_messages(message, amount = 20) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: not ideal cuz parses EVERY message from that number lol
        const resetMessage = yield prisma.messages.findFirst({ where: { number: message.number, content: 'r' }, orderBy: { id: 'desc' } });
        let resetMessageLoc;
        resetMessage === null ? resetMessageLoc = 0 : resetMessageLoc = resetMessage.id;
        const previous_messages = yield prisma.messages.findMany({ where: { number: message.number, id: { gt: resetMessageLoc } }, orderBy: { id: 'desc' }, take: amount });
        const previous_messages_string = previous_messages.map((message) => { return `\n[${message.date ? message.date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true }) : null}] ${message.is_outbound ? 'Journal:' : 'Human: '} ${message.content}`; }).reverse().join('');
        return previous_messages_string;
    });
}
function respond_text(message, prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const t0 = Date.now();
            let openAIResponse = yield openai.createCompletion({
                model: 'text-davinci-003',
                prompt: prompt, max_tokens: 512, temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
            });
            yield send_message({ content: openAIResponse.data.choices[0].text, number: message.number, tokens: message.tokens });
            console.log(`${Date.now() - t0}ms - respond_text`);
        }
        catch (err) {
            console.log(` ! respond_text error: ${err}`);
        }
    });
}
const send_style_options = ["celebration", "shooting_star", "fireworks", "lasers", "love", "confetti", "balloons", "spotlight", "echo", "invisible", "gentle", "loud", "slam"];
const signup_link = 'https://tally.so/r/w4Q7kX', admin_numbers = ['+13104974985', '+12015190240'];
function send_message(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const t0 = Date.now();
            message.date = new Date(), message.is_outbound = true;
            yield sendblue.sendMessage({ content: message.content, number: message.number, send_style: message.send_style, media_url: message.media_url, status_callback: `${link}/message-status` });
            log_message(message);
            console.log(`${Date.now() - t0}ms - send_message`);
        }
        catch (e) {
            error_alert(e);
        }
    });
}
function get_user(number) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield prisma.users.findFirst({ where: { number: number } });
        }
        catch (e) {
            error_alert(e);
        }
    });
}
// ====================================ADMIN STUFF==================================
function error_alert(error) {
    return __awaiter(this, void 0, void 0, function* () {
        // await send_message({ content: `ERROR: ${error}`, number: admin_numbers.toString() })
        console.error(`ERROR: ${error}`);
    });
}
