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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const fs_1 = __importDefault(require("fs"));
const chrono = __importStar(require("chrono-node"));
const quotes_1 = require("./other_data/quotes");
const app = (0, express_1.default)(), sendblue = new sendblue_1.default(process.env.SENDBLUE_API_KEY, process.env.SENDBLUE_API_SECRET), configuration = new openai_1.Configuration({ organization: process.env.OPENAI_ORGANIZATION, apiKey: process.env.OPENAI_API_KEY, });
const openai = new openai_1.OpenAIApi(configuration);
let hostname = '0.0.0.0', link = 'https://jrnl.onrender.com';
const PORT = Number(process.env.PORT);
if (os_1.default.hostname().split('.').pop() === 'local')
    hostname = '127.0.0.1', link = process.env.NGROK;
app.listen(PORT, hostname, () => { console.log(`server at http://${hostname}:${PORT}/`); });
app.use(express_1.default.static('public'));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(body_parser_1.default.json());
app.use((0, morgan_1.default)('dev'));
app.use('/assets', express_1.default.static('assets'));
// ========================================================================================
// ========================================DATABASE========================================
// ========================================================================================
let clientConfig; // need to pass ssl: true for external access
process.env.PGHOST.includes('render') ? clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true } : clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) };
const client = new pg_1.Client(clientConfig), prisma = new client_1.PrismaClient();
client.connect();
const default_message = {
    content: null, number: '', type: null, is_outbound: null, date: new Date(), was_downgraded: null, media_url: null, send_style: null, group_id: null,
    response_time: 0, content_letters: null, tokens: null,
    human: null, reactions: [], keywords: [], relevance: null, model: null, hour: null,
};
const default_user = {
    number: '', bio: '', timezone: client_1.Timezone.PST, principles: '',
    model: null, freq: null, pres: null, temp: null,
    directive: ''
};
function log_message(message) {
    return __awaiter(this, void 0, void 0, function* () {
        if (message.content)
            message.content_letters = content_letters(message.content);
        yield prisma.message.create({ data: message });
    });
}
const content_letters = (content) => content.slice(0, 30).replace(/[^a-z]/gi, "");
let Watts, Pulice, admins, admin_numbers;
const signup_link = 'https://tally.so/r/w4Q7kX', contact_card = `${link}/assets/jrnl.vcf`;
// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================
app.post('/signup-form', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const t0 = Date.now();
        let fields = req.body.data.fields, user = Object.assign(Object.assign({}, default_user), { number: fields[0].value, timezone: fields[1].options.find((option) => option.id === fields[1].value).text });
        res.status(200).end();
        yield prisma.user.upsert({ where: { number: user.number }, update: user, create: user });
        if (!users.includes(user)) {
            yield send_message(Object.assign(Object.assign({}, default_message), { content: `Hi I'm jrnl, your conversational AI journal. We're trying to  Reply to my questions or text me when you want. I messsage every 3 hours throughout the day, Feel free to react to messages to better train me. Everything operates on natural language, so no need to learn any fancy commands. Your 'bio' provides me insight, helping me help you. Ask to view it or change it anytime. Remember, no special commands just speak as you would Add the contact card and pin me in your messages for quick access.`, number: user.number, media_url: contact_card, send_style: client_1.SendStyle.lasers, response_time: t0 }));
            yield sendblue.sendGroupMessage({ content: `NEW USER`, numbers: admin_numbers });
            users.push(user);
        }
    }
    catch (e) {
        res.status(500).end();
        error_alert(e);
    }
}));
app.post('/message', (req, res) => {
    try {
        const message = Object.assign(Object.assign({}, default_message), { content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: Number(req.body.group_id), response_time: Number(new Date().valueOf()) });
        res.status(200).end();
        analyze_message(message);
        console.log(`(${message.number}): ${message.content} (${message.media_url})`);
    }
    catch (e) {
        res.status(500).end();
        error_alert(e);
    }
});
app.post('/message-status', (req, res) => {
    try {
        const message_status = req.body;
        res.status(200).end();
    }
    catch (e) {
        res.status(500).end();
        error_alert(e);
    }
});
const sendblue_callback = `${link}/message-status`;
// ======================================================================================
// ======================================CRON, CACHE=====================================
// ======================================================================================
const timezones = Object.values(client_1.Timezone), current_hour = new Date().getHours() - 7; // time is GMT, our T0 is PST
const daily_quotes = new cron_1.default.CronJob('55 */1 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    users.forEach((user) => __awaiter(void 0, void 0, void 0, function* () {
        if ([9, 21].includes(current_hour + timezones.indexOf(user.timezone))) {
            yield send_message(Object.assign(Object.assign({}, default_message), { content: (0, quotes_1.get_quote)(), number: user.number, response_time: current_hour }));
        }
    }));
}));
daily_quotes.start();
const gratitude_journal = new cron_1.default.CronJob('0 */1 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    users.forEach((user) => __awaiter(void 0, void 0, void 0, function* () {
        if (8 == new Date().getHours() - 7 + timezones.indexOf(user.timezone)) {
            yield send_message(Object.assign(Object.assign({}, default_message), { content: `What are three things you're grateful for?`, number: user.number }));
        }
    }));
}));
gratitude_journal.start();
// every Sunday at 9pm local
const weekly_summary = new cron_1.default.CronJob('0 * * * 0', () => __awaiter(void 0, void 0, void 0, function* () {
    users.forEach((user) => __awaiter(void 0, void 0, void 0, function* () {
        const last_week_messages = yield prisma.message.findMany({ where: { number: user.number, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), }, }, orderBy: { date: 'asc', } });
        if (21 == current_hour + timezones.indexOf(user.timezone)) { }
        const last_week_messages_string = last_week_messages.map((message) => { return `\n${message.is_outbound ? 'Journal:' : 'Human:'} ${message.content}`; }).join('');
        const openAIResponse = yield openai.createCompletion({
            model: 'text-davinci-003', temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
            prompt: `${fs_1.default.readFileSync('prompts/summarize.txt', 'utf8')}\nEntries: ${last_week_messages_string}\nResponse:`
        });
        const response = openAIResponse.data.choices[0].text;
        yield send_message(Object.assign(Object.assign({}, default_message), { content: response, number: user.number, response_time: current_hour }));
    }));
}));
weekly_summary.start();
let users;
local_data();
function local_data() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            users = yield prisma.user.findMany();
            Watts = yield prisma.user.findUnique({ where: { number: '+13104974985' } }), Pulice = yield prisma.user.findUnique({ where: { number: '+12015190240' } });
            if (Watts && Pulice)
                admins = [Watts, Pulice], admin_numbers = admins.map(admin => admin.number);
        }
        catch (e) {
            console.log(e);
        }
    });
}
// ======================================================================================
// ========================================FUNCTIONS=====================================
// ======================================================================================
const temp_default = 0.9, pres_default = 1.0, freq_defualt = 1.0, model_default = 'text';
let temp = temp_default, pres = pres_default, freq = freq_defualt, model = model_default;
function analyze_message(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const t0 = Date.now();
            const response_message = Object.assign(Object.assign({}, default_message), { number: message.number });
            if (!message.content || !message.number) {
                return;
            }
            if (message.content.toLowerCase() === 'reset') {
                message.type = 'reset';
                log_message(Object.assign(Object.assign({}, message), { type: client_1.Type.reset }));
                return;
            }
            let user = yield prisma.user.findFirst({ where: { number: message.number } });
            if (!user) {
                error_alert(`user not found: ${message.number}`);
                return;
            }
            const previous_messages = yield get_previous_messages(message, 8, false);
            user.freq = freq_defualt;
            user.pres = pres_default;
            user.temp = temp_default;
            user.model = model_default;
            console.log(`${log_time(message.response_time)} - user`);
            // checking for Reaction messages
            const reactions_array = Object.values(client_1.Reactions);
            if (reactions_array.some(reaction => { var _a; return (_a = message.content) === null || _a === void 0 ? void 0 : _a.startsWith(reaction); })) {
                const reaction_and_message = message.content.split('“', 2);
                let reacted_message = yield prisma.message.findFirst({ where: { number: message.number, content_letters: { startsWith: content_letters(reaction_and_message[1].slice(0, -3)) } } });
                if (reacted_message) {
                    reacted_message.reactions.push(reaction_and_message[0].split(' ')[0]);
                    yield prisma.message.update({ where: { id: reacted_message.id }, data: { reactions: reacted_message.reactions } });
                }
                console.log(`reactions: ${Date.now() - t0}ms`);
                return;
            }
            if (message.content.toLowerCase().startsWith('admin:') && admins.includes(user)) {
                console.log(`${log_time(message.response_time)} - admin`);
                yield send_message(Object.assign(Object.assign({}, default_message), { content: message.content.split(':').pop(), media_url: message.media_url, type: client_1.Type.question }), users);
                return;
            }
            yield log_message(message); // wait til after admin commands
            // categorize message
            const categories = Object.values(client_1.Type);
            const category_response = yield openai.createCompletion({
                model: 'text-davinci-003', temperature: 0.3,
                prompt: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}. "customer_support" is ONLY for people asking specifically about how the service works. Examples:
      Text: I need help planning my day
      Category: discuss
      Text: what's my bio
      Category: update_profile
      Text: change my hometown to Ann Arbor
      Category: update_profile
      Text: how does this app work
      Category: customer_support
      Text: gimme a quote
      Category: quote
      Some of your previous conversation is included below for context
      ###
      ${previous_messages}
      ###
      Text: ${message.content}
      Category:`
            });
            const category = category_response.data.choices[0].text.toLowerCase().replace(/\s/g, '');
            console.log(`${log_time(message.response_time)} - category == ${category}`);
            if (!category || !categories.includes(category)) {
                error_alert(` ! miscategorization (${message.number}): '${message.content}'\ncategory: ${category}`);
                yield send_message(Object.assign(Object.assign({}, default_message), { content: `Sorry bugged out, try again`, number: message.number }));
                return;
            }
            // specific functions
            if (category == client_1.Type.discuss) {
                const previous_messages_string = previous_messages.map((message) => { var _a; return `\n[${(_a = message.date) === null || _a === void 0 ? void 0 : _a.toLocaleString('en-US', message_date_format)}] ${message.is_outbound ? 'Journal:' : 'Human: '} ${message.content}`; }).join('');
                let init_prompt = fs_1.default.readFileSync('prompts/init_prompt.txt', 'utf8');
                let openAIResponse = yield openai.createCompletion({
                    model: 'text-davinci-003', temperature: temp, presence_penalty: pres, frequency_penalty: freq,
                    prompt: `${init_prompt}
        ${user.bio}
        ###
        ${previous_messages_string}
        [${new Date().toLocaleString('en-US', message_date_format)}] Journal:`
                });
                if (!openAIResponse.data.choices[0].text) {
                    error_alert('OpenAI Response was empty');
                    return;
                }
                console.log(`${log_time(message.response_time)} - prompt + openAIResponse.data.choices[0].text`);
                console.log(prompt + openAIResponse.data.choices[0].text);
                send_message(Object.assign(Object.assign({}, response_message), { content: openAIResponse.data.choices[0].text, response_time: message.response_time }));
            }
            else if (category == client_1.Type.update_profile) {
                let openAIResponse = yield openai.createCompletion({
                    model: 'text-davinci-003', temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0,
                    prompt: `${fs_1.default.readFileSync('prompts/update_profile_prompt.txt', 'utf8')}
        current bio:${user.bio}
        current principles:${user.principles}
        Message: ${message.content}
        updated bio:`
                });
                const response = openAIResponse.data.choices[0].text.split(':');
                yield send_message(Object.assign(Object.assign({}, response_message), { content: `${response[0].toLowerCase().replace(/\s/g, '') == 'view' ? 'your bio:' : 'updated bio:'}\n${response[1]}` }));
                yield prisma.user.update({ where: { number: message.number }, data: { bio: response[1] } });
            }
            else if (category == client_1.Type.help) {
                let openAIResponse = yield openai.createCompletion({
                    model: 'text-davinci-003', temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
                    prompt: `${fs_1.default.readFileSync('prompts/help.txt', 'utf8')}
        Text: ${message.content}
        Response:`
                });
                const response = openAIResponse.data.choices[0].text;
                yield send_message(Object.assign(Object.assign({}, response_message), { content: response ? response : 'Sorry bugged out. Try again' }));
            }
            else if (category == client_1.Type.quote) {
                yield send_message(Object.assign(Object.assign({}, response_message), { content: (0, quotes_1.get_quote)() }));
            }
            else if (category == client_1.Type.customer_support) {
                send_message(Object.assign(Object.assign({}, response_message), { content: `Sorry for the inconvenience, somebody from the team will reach out.` }));
                send_message(Object.assign(Object.assign({}, response_message), { content: ` ! Customer support request from (${user.number})\n${message.content}` }), admins);
            }
            else if (category == client_1.Type.advice) {
            }
            else if (category == client_1.Type.model) {
                /* let openAIResponse = await openai.createCompletion({
                  model: 'text-davinci-003', temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0,
                  prompt: `The user wants to modify their model and the weights of that model. The two possible models are "chat" and "text". The weights are "temperature", "frequency", and "presence". Adjust the values accordingly. Keep the order exactly the same.
                  Current:
                  model: ${user.model}
                  temperature: ${user.temp}
                  frequency: ${user.freq}
                  presence: ${user.pres}
                  Message: ${message.content}\n
                  Updated:`
                })
                let response = openAIResponse.data.choices[0].text!.split('\n')
                let response_values = response.map((line: string) => { return line.split(':') })
                if (!response_values) { return }
                let user_update = prisma.user.update({ where: { number: message.number! }, data: { model: response_values[0], temp: response_values[1], freq: response_values[2], pres: response_values[3] } }) */
            }
            console.log(`$${log_time(message.response_time)} - analyze_message`);
        }
        catch (e) {
            error_alert(` ! analyze_message (${message.number}): ${e}`);
        }
    });
}
const message_date_format = { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true };
function get_previous_messages(message, amount = 14, chat) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO not ideal cuz parses EVERY message from that number lol
        const resetMessage = yield prisma.message.findFirst({ where: { number: message.number, content: 'reset' }, orderBy: { id: 'desc' } });
        let resetMessageLoc;
        resetMessage === null ? resetMessageLoc = 0 : resetMessageLoc = resetMessage.id;
        let previous_messages = yield prisma.message.findMany({ where: { number: message.number, id: { gt: resetMessageLoc } }, orderBy: { id: 'desc' }, take: amount });
        return previous_messages.reverse();
    });
}
function send_message(message, users) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            message.date = new Date(), message.is_outbound = true;
            if (message.response_time)
                message.response_time = Number(message.date.valueOf() - message.response_time) / 1000;
            console.log(message.response_time);
            if (users) {
                for (const user of users) {
                    sendblue.sendMessage({ content: message.content ? message.content : undefined, number: user.number, send_style: message.send_style ? message.send_style : undefined, media_url: message.media_url ? message.media_url : undefined, status_callback: sendblue_callback });
                    log_message(message);
                }
            }
            else {
                sendblue.sendMessage({ content: message.content ? message.content : undefined, number: message.number, send_style: message.send_style ? message.send_style : undefined, media_url: message.media_url ? message.media_url : undefined, status_callback: sendblue_callback });
                log_message(message);
            }
            console.log(`${Date.now() - message.date.valueOf()}ms - send_message`);
        }
        catch (e) {
            error_alert(e);
        }
    });
}
// ======================================================================================
// =====================================ADMIN STUFF======================================
// ======================================================================================
function error_alert(error, message) {
    return __awaiter(this, void 0, void 0, function* () {
        yield send_message(Object.assign(Object.assign({}, default_message), { content: `ERROR: ${error}`, number: admins.toString() }));
        console.error(`ERROR: ${error}`);
        if (message)
            yield send_message(Object.assign(Object.assign({}, default_message), { content: `Sorry bugged out, try again.`, number: message.number }));
    });
}
function log_time(time) {
    return __awaiter(this, void 0, void 0, function* () {
        return `${((new Date().valueOf() - time) / 1000).toFixed(1)}sec`;
    });
}
// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================
// test()
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const chrono_output = chrono.parse('5pm to 7pm');
            // console.log(chrono_output[0])
        }
        catch (e) {
            error_alert(e);
        }
    });
}
function summarize(text) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const openAIResponse = yield openai.createCompletion({
                model: 'text-davinci-003', temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
                prompt: `${fs_1.default.readFileSync('prompts/summarize.txt', 'utf8')}\nEntries: ${text}\nResponse:`
            });
            const response = openAIResponse.data.choices[0].text;
            return response;
        }
        catch (e) {
            error_alert(e);
        }
    });
}
/* async function update_table(){
  const table = await prisma.table.findMany()
  console.log(table)
  table.forEach(async (row) => {
    const hour = row.date.getHours()
    await prisma.table.update({ where: { id: row.id }, data: new_row })
  })
} */ 
