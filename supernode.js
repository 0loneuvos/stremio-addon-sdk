const WebSocket = require('ws')
const ipfsClient = require('ipfs-http-client')

// @TODO: this is duplicated with publish.js, fix it
const IPFS_WRITE_OPTS = {
	create: true,
	parents: true,
	truncate: true
}
const IPFS_MSG_PATH = '/msgs'

const byIdentifier = new Map()

function onConnection(ws) {
	ws.on('message', data => {
		let msg
		try { msg = JSON.parse(data) } catch(e) {
			console.error(e)
		}
		// @TODO more checks
		if (msg) onMessage(msg).catch(e => console.error(e))
	})
	//ws.send(JSON.stringify());
}

// @TODO pin
async function onMessage(msg) {
	console.log(msg)
	if (msg.type === 'Publish') {
		byIdentifier.set(msg.identifier, msg.hash)
		await ipfs.files.write(`${IPFS_MSG_PATH}/${msg.identifier}`, Buffer.from(JSON.stringify(msg)), IPFS_WRITE_OPTS)
	}
}

async function readCachedMsgs() {
	const files = await ipfs.files.ls(`/${IPFS_MSG_PATH}`)
	// @TODO: warning: this doesn't consider whether the contents are files or not
	const buffers = await Promise.all(files.map(f => ipfs.files.read(`/${IPFS_MSG_PATH}/${f.name}`)))
	for (buf of buffers) {
		// @TODO: reuse onMessage, but without the write
		const msg = JSON.parse(buf.toString())
		byIdentifier.set(msg.identifier, msg.hash)
	}
}

// Server part
// @TODO caching
const express = require('express')
const app = express()
const ipfs = ipfsClient('localhost', '5001', { protocol: 'http' })
app.use('/:identifier', async function(req, res, next) {
	const hash = byIdentifier.get(req.params.identifier.trim())
	if (hash) {
		const path = `/ipfs/${hash}${req.url}`
		res.setHeader('content-type', 'application/json')
		ipfs.catReadableStream(path)
			.on('error', e => {
				if (e.statusCode === 500 && e.message.startsWith('no link named'))
					res.sendStatus(404)
				else
					throw e
			})
			.pipe(res)
	} else {
		res.sendStatus(404)
	}
})

// Initialize
async function init() {
	// replay previous Publish messages
	await readCachedMsgs()

	const wss = new WebSocket.Server({ port: 14001 })
	wss.on('connection', onConnection)

	app.listen(3006)
}

init().catch(e => console.error(e))