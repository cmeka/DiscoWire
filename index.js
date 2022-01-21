const http = require('http');
const dotenv = require('dotenv');
const fetch = require('cross-fetch');
const { parse } = require('querystring');
const { Client, Intents } = require('discord.js');
const discord = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
dotenv.config();

discord.on('ready', async () => {
	console.log(`Logged in as ${discord.user.tag}!`);
});
discord.on('messageCreate', async (message) => {
	if (process.env.DISCORD_USER_ID && message.author.id !== process.env.DISCORD_USER_ID) return;

	if (!message.system && message.type == "DEFAULT" && message.channel.type === "GUILD_PUBLIC_THREAD") {
		let media = Array.from(message.attachments.values());
		if (media.length) media = media.map((m) => m.url);
		var from = normalizePhone(message.channel.parent.topic);
		var to = normalizePhone(message.channel.name);
		sendSms(from, to, message.content, media);
	}
});
discord.login(process.env.DISCORD_TOKEN);

async function sendMsg(msg) {
	var server = discord.guilds.cache.find(ch => ch.id === process.env.DISCORD_SERVER_ID);
	if (!server) await sendBotMsg(`Server ID not found.`);
	var ch_to = server.channels.cache.find(
		ch => ch.type === "GUILD_TEXT" && ch.topic && ch.topic.replace(/\D/g,'') && (new RegExp( ch.topic.replace(/\D/g,'') )).test(msg.To)
	);
	if (!ch_to) {
		ch_to = await server.channels.create(msg.To, { reason: 'New number' });
	}
	await ch_to.threads.fetchArchived();

	var ch_from = ch_to.threads.cache.find(
		ch => ch.type === "GUILD_PUBLIC_THREAD" && ch.parentId == ch_to.id && ch.name.replace(/\D/g,'') && (new RegExp( ch.name.replace(/\D/g,'') )).test(msg.From)
	);
	if (ch_from && ch_from.archived) await ch_from.setArchived(false);

	var media = [];
	if (parseInt(msg.NumMedia) > 0) for (let i = 0; i < parseInt(msg.NumMedia); i++) {
		if (msg['MediaContentType'+i] === 'text/plain') continue;
		media.push({ attachment: msg['MediaUrl'+i], name: new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '') + '_' + i +'.jpg' });
	}

	let msg_opts = {};
	if (msg.Body) msg_opts.content = msg.Body;
	if (media.length) msg_opts.files = media;

	if (ch_from) {
		ch_from.send(msg_opts);
	} else {
		console.log(`Creating new thread for ${msg.From}`);
		const thread = await ch_to.threads.create({
			name: msg.From,
			autoArchiveDuration: 1440
		});
		thread.send(msg_opts);
		console.log(`Created thread: ${thread.name}`);
	}
}

async function sendBotMsg(msg) {
	await (await discord.users.fetch(process.env.DISCORD_USER_ID)).send(msg);
}

const server = http.createServer((req, res) => {
	if (req.method === 'POST' && req.url === '/laml') {
		collectRequestData(req, result => {
			console.log(`Message received, ID: ${result.MessageSid}`);
			sendMsg(result);
			res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
		});
	} else {
		res.end();
	}
});

async function sendSms(from, to, body, media) {
	if (!from || !to || !/\d{10}/.test(from) || !/\d{10}/.test(to)) return;
	let msg = {
		context: 'discord',
		from: from,
		to: to
	};
	let params = new URLSearchParams();
	params.append('From', from);
	params.append('To', to);
	
	if (body) params.append('Body', body);
	if (media) params.append('MediaUrl', media);
	
	const sendResult = await fetch(`https://${process.env.SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${process.env.SIGNALWIRE_PROJECT}/Messages.json`, {
		method: 'POST',
		headers: {
			'Authorization': 'Basic ' + Buffer.from(process.env.SIGNALWIRE_PROJECT + ":" + process.env.SIGNALWIRE_TOKEN).toString('base64')
		},
		body: params
	});
	const data = await sendResult.json();
	data.error_code ? console.error(data.error_message) : console.log('Message sent, ID: ', data.sid);
}

function normalizePhone(phone) {
	if (/^\+/.test(phone)) return phone;
	phone = phone.replace(/\D/g,'');
	if (!phone) return false;
	return '+' + (/^1\d{10}/.test(phone) ? phone : '1' + phone);
}

function collectRequestData(request, callback) {
	if (request.headers['content-type'] === 'application/x-www-form-urlencoded') {
		let body = '';
		request.on('data', chunk => {
			body += chunk.toString();
		});
		request.on('end', () => {
			callback(parse(body));
		});
	} else {
		callback(null);
	}
}

server.listen(process.env.HTTP_PORT);