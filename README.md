# DiscoWire
A SignalWire and VoIP.ms SMS/MMS messaging gateway via Discord

# Installation
git clone https://github.com/cmeka/DiscoWire.git && cd DiscoWire

npm install

cp .env.example .env

Create a SignalWire API token with Messaging permissions.

Open .env and insert tokens.

Create a Discord server and bot:
https://discordpy.readthedocs.io/en/stable/discord.html

At Step 6 of 'Inviting Your Bot' the following is the minimum required permissions:

General Permissions
- Manage Channels
- Read Messages/View Channels

Text Permissions
- Send Messages
- Create Public Threads
- Send Messages in Threads
- Manage Threads
- Embed Links
- Attach Files
- Read Message History

Edit your SignalWire or VoIP.ms numbers to webhook/URL callback to this server either via reverse proxy or port forward.

Use the following paths:

Ex. "http://EXAMPLE.DOMAIN:PORT/signalwire" or "http://EXAMPLE.DOMAIN:PORT/voipms?to={TO}&from={FROM}&id={ID}&date={TIMESTAMP}&message={MESSAGE}"

Run: node index.js