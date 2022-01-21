var url = require('url');
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
		sendSms(/signalwire/i.test(message.channel.parent.topic) ? 'signalwire' : 'voipms', from, to, message.content, media);
	}
});
discord.login(process.env.DISCORD_TOKEN);

async function sendMsg(msg) {
	var server = discord.guilds.cache.find(ch => ch.id === process.env.DISCORD_SERVER_ID);
	if (!server) await sendBotMsg(`Server ID not found.`);
	var ch_to = server.channels.cache.find(
		ch => ch.type === "GUILD_TEXT" && ch.topic && ch.topic.replace(/\D/g,'') && (new RegExp( ch.topic.replace(/\D/g,'') )).test(normalizePhone(msg.To))
	);
	if (!ch_to) {
		ch_to = await server.channels.create(msg.To, { topic: normalizePhone(msg.To) });
	}
	await ch_to.threads.fetchArchived();

	var ch_from = ch_to.threads.cache.find(
		ch => ch.type === "GUILD_PUBLIC_THREAD" && ch.parentId == ch_to.id && ch.name.replace(/\D/g,'') && (new RegExp( ch.name.replace(/\D/g,'') )).test(normalizePhone(msg.From))
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
	console.error(msg);
	await (await discord.users.fetch(process.env.DISCORD_USER_ID)).send(msg);
}

const server = http.createServer(async (req, res) => {
	if (req.method === 'POST' && req.url === '/signalwire') {
		collectRequestData(req, result => {
			console.log(`Message received, ID: ${result.MessageSid}`);
			sendMsg(result);
			res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
		});
	} else if (req.method === 'GET' && /^\/voipms/.test(req.url)) {
		var query = url.parse(req.url, true).query;
		console.log(query);
		var msg = {'To': query.to, 'From': query.from};
		var media = [];
		if (query.message) {
			msg.Body = query.message;
		} else {
			const response = await fetch(`https://voip.ms/api/v1/rest.php?api_username=${process.env.VOIPMS_USERNAME}&api_password=${process.env.VOIPMS_API_PASS}&method=getMMS`);
			const data = await response.json();
			if (data.status === 'success') {
				let sms = data.sms.find((sms) => sms.id === query.id);
				if (sms) media = sms.media;
			}	
		}
		for (let i = 0; i < media.length; i++) msg['MediaUrl'+i] = media[i];
		msg.NumMedia = media.length;
		sendMsg(msg);
	} else {
		console.log(req.url);
		res.end();
	}
});

async function sendSms(service, from, to, body, media) {
	if (!from || !/\d{10}/.test(from)) return await sendBotMsg(`Missing 'From' number in channel topic.`);
	if (!to ||!/\d{10}/.test(to)) return await sendBotMsg(`Missing 'To' number in thread name.`);
	
	let params = new URLSearchParams();
	if (service == 'signalwire') {
		params.append('From', from);
		params.append('To', to);
		
		if (body) params.append('Body', body);
		if (media) params.append('MediaUrl', media);
		
		const response = await fetch(`https://${process.env.SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${process.env.SIGNALWIRE_PROJECT}/Messages.json`, {
			method: 'POST',
			headers: {
				'Authorization': 'Basic ' + Buffer.from(process.env.SIGNALWIRE_PROJECT + ":" + process.env.SIGNALWIRE_TOKEN).toString('base64')
			},
			body: params
		});
		if (response.ok || response.status === 422) {
			const data = await response.json();
			data.error_code || data.message ? sendBotMsg(`Sending SMS Error: ${data.error_message || data.message}`) : console.log('Message sent, ID: ', data.sid);
		} else {
			sendBotMsg(`Sending SMS HTTP Error: ${response.status} ${response.statusText}`);
		}
	} else if (service == 'voipms') {
		params.append('did', from.replace(/^\+1/, ''));
		params.append('dst', to.replace(/^\+1/, ''));
		params.append('message', body ? body : '');
		if (media) params.append('media1', media);
		const response = await fetch(`https://voip.ms/api/v1/rest.php?api_username=${process.env.VOIPMS_USERNAME}&api_password=${process.env.VOIPMS_API_PASS}&method=sendSMS&`+params.toString());
		if (response.ok) {
			const data = await response.json();
			console.log('Message sent, ID: ', data.sms);
		} else {
			sendBotMsg(`Sending SMS HTTP Error: ${response.status} ${response.statusText}`);
		}
	}
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