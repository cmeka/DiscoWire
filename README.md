# DiscoWire
 SMS/MMS via SignalWire and Discord

# Installation
git clone https://github.com/cmeka/DiscoWire.git && cd DiscoWire

npm install

cp .env.example .env

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

Create a SignalWire API token with Messaging permissions.

Edit your SignalWire numbers to webhook to this server either via reverse proxy or port forward:

Ex. "http://EXAMPLE.DOMAIN:PORT/laml"

Use "/laml" as the URL path.

Open .env and insert tokens.

Run: node index.js


To do
- Remove the @signalwire/node dependancy since it's not needed and buggy (unable to close socket connection)
