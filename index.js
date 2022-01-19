const http = require('http');
const dotenv = require('dotenv');
const { parse } = require('querystring');
const { RelayClient } = require('@signalwire/node');
const { Client, Intents } = require('discord.js');
const discord = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
dotenv.config();

discord.on('ready', async () => {
	console.log(`Logged in as ${discord.user.tag}!`);
});
discord.on('messageCreate', async (message) => {
	if (process.env.DISCORD_USER_ID && message.author.id != process.env.DISCORD_USER_ID) return;

	if (!message.system && message.channel.type === "GUILD_PUBLIC_THREAD") {
		let media = Array.from(message.attachments.values());
		if (media.length) media = media.map((m) => m.url);

		var ch_from = discord.channels.cache.find( ch => ch.id === message.channel.parentId );
		var from = normalizePhone(ch_from.name);
		var to = normalizePhone(message.channel.name);
		console.log(from, to, message.content, media);
		sendSms(from, to, message.content, media);
	}
});
discord.login(process.env.DISCORD_TOKEN); // discord token

const client = new RelayClient({
	project: process.env.SIGNALWIRE_PROJECT,
	token: process.env.SIGNALWIRE_TOKEN
});

async function sendMsg(msg) {
	var ch_to = discord.channels.cache.find(
		ch => ch.type === "GUILD_TEXT" && ch.name.replace(/\D/g,'') && (new RegExp( ch.name.replace(/\D/g,'') )).test(msg.To)
	);
	await ch_to.threads.fetchArchived();

	var ch_from = discord.channels.cache.find(
		ch => ch.type === "GUILD_PUBLIC_THREAD" && ch.parentId == ch_to.id && ch.name.replace(/\D/g,'') && (new RegExp( ch.name.replace(/\D/g,'') )).test(msg.From)
	);
	if (ch_from && ch_from.locked) await ch_from.setArchived(false);

	var media = [];
	if (parseInt(msg.NumMedia) > 0) for (let i = 0; i < parseInt(msg.NumMedia); i++) {
		if (msg['MediaContentType'+i] === 'text/plain') continue;
		media.push({ attachment: msg['MediaUrl'+i], name: new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '') + '_' + i +'.jpg' });
	}

	let msg_opts = {};
	if (msg.Body) msg_opts.content = msg.Body;
	if (media.length) msg_opts.files = media;
	console.log(msg_opts);

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

const server = http.createServer((req, res) => {
	if (req.method === 'POST' && req.url === '/laml') {
		collectRequestData(req, result => {
			console.log(result);
			sendMsg(result);
			res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
		});
	} else {
		res.end();
	}
});

async function sendSms(from, to, body, media) {
	let msg = {
		context: 'discord',
		from: from,
		to: to
	};
	if (body) msg.body = body;
	if (media) msg.media = media;
	const sendResult = await client.messaging.send(msg);
	if (sendResult.successful) console.log('Message ID: ', sendResult.messageId);
}

function normalizePhone(phone) {
	if (/^\+/.test(phone)) return phone;
	phone = phone.replace(/\D/g,'');
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
client.connect();