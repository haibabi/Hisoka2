const fs = require('fs')
const util = require('util')
const got = require('got')
const path = require('path')
const axios = require('axios')
const jimp_1 = require('jimp')
const { tmpdir } = require('os')
const request = require('request')
const FileType = require('file-type')
const fetch = require('node-fetch')
const { exec } = require('child_process')
const PhoneNumber = require('awesome-phonenumber')
const moment = require('moment-timezone')
const { sizeFormatter } = require('human-readable')
const {
	MessageType,
	WAMessageProto,
	DEFAULT_ORIGIN,
	getAudioDuration,
	MessageTypeProto,
	MediaPathMap,
	Mimetype,
	MimetypeMap,
	compressImage,
	generateMessageID,
	randomBytes,
	getMediaKeys,
	aesEncrypWithIV,
	hmacSign,
	sha256,
	encryptedStream
} = require('@adiwajshing/baileys')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require("./exif")
const { WAConnection } = require('@adiwajshing/baileys/lib/WAConnection/0.Base')
const { WAMetric } = require('@adiwajshing/baileys/lib/WAConnection/Constants')
const isUrl = (url) => {
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/, 'gi'))
}

exports.WAConnection = _WAConnection => {
	class WAConnection extends _WAConnection {
		constructor(...args) {
			super(...args)
			if (!Array.isArray(this._events['CB:action,add:relay,message'])) this._events['CB:action,add:relay,message'] = [this._events['CB:action,add:relay,message']]
			else this._events['CB:action,add:relay,message'] = [this._events['CB:action,add:relay,message'].pop()]
			this._events['CB:action,add:relay,message'].unshift(async function(json) {
				try {
					let m = json[2][0][2]
					if (m.message && m.message.protocolMessage && m.message.protocolMessage.type == 0) {
						let key = m.message.protocolMessage.key
						let c = this.chats.get(key.remoteJid)
						let a = c.messages.dict[`${key.id}|${key.fromMe ? 1 : 0}`]
						let participant = key.fromMe ? this.user.jid : a.participant ? a.participant : key.remoteJid
						let WAMSG = WAMessageProto.WebMessageInfo
						this.emit('message-delete', {
							key,
							participant,
							message: WAMSG.fromObject(WAMSG.toObject(a))
						})
					}
				} catch (e) {}
			})
			this.on(`CB:action,,battery`, json => {
				this.battery = Object.fromEntries(Object.entries(json[2][0][1]).map(v => [v[0], eval(v[1])]))
			})
			// Alias
			this.sendFileFromUrl = this.sendFileFromURL = this.sendFile
		}
		
		async sendImage(jid, path, caption = '', quoted, options) {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            return await this.sendMessage(jid, buff, MessageType.image, { quoted, caption: caption, ...options })
        }
		
	async sendImageAsSticker(jid, path, quoted, options) {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            let buffer
            if (options && (options.packname || options.author)) {
                buffer = await writeExifImg(buff, options)
            } else {
                buffer = await imageToWebp(buff)
            }
            return await this.sendMessage(jid, buffer, MessageType.sticker, { quoted, ...options })
        }
		
	async sendVideoAsSticker(jid, path, quoted, options) {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            let buffer
            if (options && (options.packname || options.author)) {
                buffer = await writeExifVid(buff, options)
            } else {
                buffer = await videoToWebp(buff)
            }
            return await this.sendMessage(jid, buffer, MessageType.sticker, { quoted, ...options })
        }
		
        async sendAudio(jid, path, filename = '', quoted, options) {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            return await this.sendMessage(jid, buff, MessageType.audio, { quoted, filename: filename, mimetype: 'audio/mp4', ptt: false, ...options })
        }

        async sendPtt(jid, path, quoted, options) {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            return await this.sendMessage(jid, buff, MessageType.audio, { quoted, mimetype: 'audio/mp4', ptt: true, ...options })
        }

        async sendVideo(jid, path, caption = "", quoted, options) {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            return await this.sendMessage(jid, buff, MessageType.video, { quoted, caption: caption, mimetype: 'video/mp4', ...options })
        }

		async sendGif(jid, path, caption = "", quoted, options) {
            let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            return await this.sendMessage(jid, buff, MessageType.video, { quoted, caption: caption, mimetype: 'video/gif', ...options })
        }
		
	async sendText(jid, text, quoted = '', options = {}) {
		return await this.sendMessage(jid, text, MessageType.text, { quoted, ...options })
	}
	
	async decryptMedia(mek) {
            if (!mek || !mek.message) return Buffer.alloc(0)
            if (!mek.message[Object.keys(mek.message)[0]].url) await this.updateMediaMessage(mek)
            return await this.downloadAndSaveMediaMessage(mek)
        }
	
		async sendContactArray(jid, kon, opts = {}) {
			let list = []
			for (let i of kon) {
				list.push({
					displayName: this.getName(i),
					vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${this.getName(i)}\nFN:${this.getName(i)}\nitem1.TEL;waid=${i.split('@')[0]}:${i.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
				})
			}
			return this.sendMessage(jid, {
				displayName: `${list.length} kontak`,
				contacts: list
			}, 'contactsArrayMessage', { ...opts })
		}

		async rejectIncomingCall(jid, id) {
        const tag = this.generateMessageTag();
        const nodePayload = ['action', 'call', ['call', {
                    'from': this.user.jid,
                    'to': `${jid.split('@')[0]}@s.whatsapp.net`,
                    'id': tag
                }, [['reject', {
                            'call-id': id,
                            'call-creator': `${jid.split('@')[0]}@s.whatsapp.net`,
                            'count': '0'
                        }, null]]]];
        const response = await this.sendJSON(nodePayload, tag);
        return response;
    }

		async updateProfilePicture(jid, img) {
			//jid = whatsappID (jid)
			const data = await exports.generateProfilePicture(img)
			const tag = this.generateMessageTag()
			const query = [
				'picture',
				{
					jid: jid,
					id: tag,
					type: 'set'
				},
				[
					['image', null, data.img],
					['preview', null, data.preview]
				]
			]
			const response = await (this.setQuery([query], [WAMetric.picture, 136], tag))
			if (jid === this.user.jid) this.user.imgUrl = response.eurl
			else if (this.chats.get(jid)) {
				this.chats.get(jid).imgUrl = response.eurl
				this.emit('chat-update', {
					jid,
					imgUrl: response.eurl
				})
			}
			return response
		}

		/**
		 * Exact Copy Forward
		 * @param {String} jid 
		 * @param {Object} message 
		 * @param {Boolean} forceForward 
		 * @param {Object} options 
		 */
		async copyNForward(jid, message, forceForward = false, options = {}) {
			let vtype
			if (options.readViewOnce) {
				message.message = message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message ? message.message.ephemeralMessage.message : (message.message || undefined)
				vtype = Object.keys(message.message.viewOnceMessage.message)[0]
				delete(message.message && message.message.ignore ? message.message.ignore : (message.message || undefined))
				delete message.message.viewOnceMessage.message[vtype].viewOnce
				message.message = {
					...message.message.viewOnceMessage.message
				}
			}

			let mtype = Object.keys(message.message)[0]
			let content = await this.generateForwardMessageContent(message, forceForward)
			let ctype = Object.keys(content)[0]
			let context = {}
			if (mtype != MessageType.text) context = message.message[mtype].contextInfo
			content[ctype].contextInfo = {
				...context,
				...content[ctype].contextInfo
			}
			const waMessage = await this.prepareMessageFromContent(jid, content, options ? {
				...content[ctype],
				...options,
				...(options.contextInfo ? {
					contextInfo: {
						...content[ctype].contextInfo,
						...options.contextInfo
					}
				} : {})
			} : {})
			await this.relayWAMessage(waMessage)
			return waMessage
		}

		/**
		 * cMod
		 * @param {String} jid 
		 * @param {*} message 
		 * @param {String} text 
		 * @param {String} sender 
		 * @param {*} options 
		 * @returns 
		 */
		cMod(jid, message, text = '', sender = this.user.jid, options = {}) {
			let copy = message.toJSON()
			let mtype = Object.keys(copy.message)[0]
			let isEphemeral = mtype === 'ephemeralMessage'
			if (isEphemeral) {
				mtype = Object.keys(copy.message.ephemeralMessage.message)[0]
			}
			let msg = isEphemeral ? copy.message.ephemeralMessage.message : copy.message
			let content = msg[mtype]
			if (typeof content === 'string') msg[mtype] = text || content
			else if (content.caption) content.caption = text || content.caption
			else if (content.text) content.text = text || content.text
			if (typeof content !== 'string') msg[mtype] = {
				...content,
				...options
			}
			if (copy.participant) sender = copy.participant = sender || copy.participant
			else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
			if (copy.key.remoteJid.includes('@s.whatsapp.net')) sender = sender || copy.key.remoteJid
			else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
			copy.key.remoteJid = jid
			copy.key.fromMe = sender === this.user.jid
			return WAMessageProto.WebMessageInfo.fromObject(copy)
		}

		/**
		 * genOrderMessage
		 * @param {String} message 
		 * @param {*} options 
		 * @returns 
		 */
		async genOrderMessage(message, options) {
			let m = {}
			switch (type) {
				case MessageType.text:
				case MessageType.extendedText:
					if (typeof message === 'string') message = {
						text: message
					}
					m.extendedTextMessage = WAMessageProto.ExtendedTextMessage.fromObject(message);
					break
				case MessageType.location:
				case MessageType.liveLocation:
					m.locationMessage = WAMessageProto.LocationMessage.fromObject(message)
					break
				case MessageType.contact:
					m.contactMessage = WAMessageProto.ContactMessage.fromObject(message)
					break
				case MessageType.contactsArray:
					m.contactsArrayMessage = WAMessageProto.ContactsArrayMessage.fromObject(message)
					break
				case MessageType.groupInviteMessage:
					m.groupInviteMessage = WAMessageProto.GroupInviteMessage.fromObject(message)
					break
				case MessageType.listMessage:
					m.listMessage = WAMessageProto.ListMessage.fromObject(message)
					break
				case MessageType.buttonsMessage:
					m.buttonsMessage = WAMessageProto.ButtonsMessage.fromObject(message)
					break
				case MessageType.image:
				case MessageType.sticker:
				case MessageType.document:
				case MessageType.video:
				case MessageType.audio:
					m = await this.prepareMessageMedia(message, type, options)
					break
				case 'orderMessage':
					m.orderMessage = WAMessageProto.OrderMessage.fromObject(message)
			}
			return WAMessageProto.Message.fromObject(m);
		}

		/**
		 * waitEvent
		 * @param {*} eventName 
		 * @param {Boolean} is 
		 * @param {Number} maxTries 
		 * @returns 
		 */
		waitEvent(eventName, is = () => true, maxTries = 25) {
			return new Promise((resolve, reject) => {
				let tries = 0
				let on = (...args) => {
					if (++tries > maxTries) reject('Max tries reached')
					else if (is()) {
						this.off(eventName, on)
						resolve(...args)
					}
				}
				this.on(eventName, on)
			})
		}

		async resend(jid, id) {
			let message = await this.loadMessage(jid, id)
			this.copyNForward(jid, message, true)
		}

		/**
		 * Send Contact
		 * @param {String} jid 
		 * @param {String|Number} number 
		 * @param {String} name 
		 * @param {Object} quoted 
		 * @param {Object} options 
		 */
		async sendContact(jid, number, name, quoted, options) {
			// TODO: Business Vcard
			number = number.replace(/[^0-9]/g, '')
			let njid = number + '@s.whatsapp.net'
			let {
				isBusiness
			} = await this.isOnWhatsApp(njid) || {
				isBusiness: false
			}
			let vcard = `
BEGIN:VCARD
VERSION:3.0
N:;${name.replace(/\n/g, '\\n')};;;
FN:${name.replace(/\n/g, '\\n')}
TEL;type=CELL;type=VOICE;waid=${number}:${PhoneNumber('+' + number).getNumber('international')}${isBusiness ? `
X-WA-BIZ-NAME:${(this.contacts[njid].vname || this.getName(njid)).replace(/\n/, '\\n')}
X-WA-BIZ-DESCRIPTION:${((await this.getBusinessProfile(njid)).description || '').replace(/\n/g, '\\n')}
` : ''}
END:VCARD
`.trim()
			return await this.sendMessage(jid, {
				displayName: name,
				vcard
			}, MessageType.contact, {
				quoted,
				...options
			})
		}

		/**
		 * sendGroupV4Invite
		 * @param {String} jid 
		 * @param {*} participant 
		 * @param {String} inviteCode 
		 * @param {Number} inviteExpiration 
		 * @param {String} groupName 
		 * @param {String} caption 
		 * @param {*} options 
		 * @returns 
		 */
		async sendGroupV4Invite(jid, participant, inviteCode, inviteExpiration, groupName = 'unknown subject', caption = 'Invitation to join my WhatsApp group', options = {}) {
			let msg = WAMessageProto.Message.fromObject({
				groupInviteMessage: WAMessageProto.GroupInviteMessage.fromObject({
					inviteCode,
					inviteExpiration: parseInt(inviteExpiration) || +new Date(new Date + (3 * 86400000)),
					groupJid: jid,
					groupName: groupName ? groupName : this.getName(jid),
					caption
				})
			})
			let message = await this.prepareMessageFromContent(participant, msg, options)
			await this.relayWAMessage(message)
			return message
		}

		/**
		 * fetchRequest
		 * @param {*} endpoint 
		 * @param {String} method ('GET'|'POST')
		 * @param {*} body 
		 * @param {*} agent 
		 * @param {*} headers 
		 * @param {*} redirect 
		 * @returns 
		 */
		fetchRequest = async (
			endpoint,
			method = 'GET',
			body,
			agent,
			headers,
			redirect = 'follow'
		) => {
			try {
				let res = await fetch(endpoint, {
					method,
					body,
					redirect,
					headers: {
						Origin: DEFAULT_ORIGIN,
						...(headers || {})
					},
					agent: agent || this.connectOptions.fetchAgent
				})
				return await res.json()
			} catch (e) {
				console.error(e)
				let res = await got(endpoint, {
					method,
					body,
					followRedirect: redirect == 'follow' ? true : false,
					headers: {
						Origin: DEFAULT_ORIGIN,
						...(headers || {})
					},
					agent: {
						https: agent || this.connectOptions.fetchAgent
					}
				})
				return JSON.parse(res.body)
			}
		}

		/**
		 * prepareMessageMedia
		 * @param {Buffer} buffer 
		 * @param {*} mediaType 
		 * @param {*} options 
		 * @returns 
		 */
		/** Prepare a media message for sending */
		async prepareMessageMedia(buffer, mediaType, options = {}) {
			await this.waitForConnection()

			if (mediaType === MessageType.document && !options.mimetype) {
				throw new Error('mimetype required to send a document')
			}
			if (mediaType === MessageType.sticker && options.caption) {
				throw new Error('cannot send a caption with a sticker')
			}
			if (!(mediaType === MessageType.image || mediaType === MessageType.video) && options.viewOnce) {
				throw new Error(`cannot send a ${mediaType} as a viewOnceMessage`)
			}
			if (!options.mimetype) {
				options.mimetype = MimetypeMap[mediaType]
			}
			let isGIF = false
			if (options.mimetype === Mimetype.gif) {
				isGIF = true
				options.mimetype = MimetypeMap[MessageType.video]
			}
			const requiresThumbnailComputation = (mediaType === MessageType.image || mediaType === MessageType.video) && !('thumbnail' in options)
			const requiresDurationComputation = mediaType === MessageType.audio && !options.duration
			const requiresOriginalForSomeProcessing = requiresDurationComputation || requiresThumbnailComputation

			const mediaKey = randomBytes(32)
			const mediaKeys = getMediaKeys(mediaKey, mediaType)
			const enc = aesEncrypWithIV(buffer, mediaKeys.cipherKey, mediaKeys.iv)
			const mac = hmacSign(Buffer.concat([mediaKeys.iv, enc]), mediaKeys.macKey).slice(0, 10)
			const body = Buffer.concat([enc, mac]) // body is enc + mac
			const fileSha256 = sha256(buffer)
			const fileEncSha256 = sha256(body)
			const {
				encBodyPath,
				bodyPath,
				fileLength,
				didSaveToTmpPath
			} = await encryptedStream(buffer, mediaType, requiresOriginalForSomeProcessing)
			// url safe Base64 encode the SHA256 hash of the body
			const fileEncSha256B64 = encodeURIComponent(
				fileEncSha256
				.toString('base64')
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/\=+$/, '')
			)
			if (requiresThumbnailComputation) await generateThumbnail(bodyPath, mediaType, options)
			if (requiresDurationComputation) {
				try {
					options.duration = await getAudioDuration(bodyPath)
				} catch (error) {
					this.logger.debug({ error }, 'failed to obtain audio duration: ' + error.message)
				}
			}

			// send a query JSON to obtain the url & auth token to upload our media
			let json = await this.refreshMediaConn(options.forceNewMediaOptions)

			let mediaUrl = ''
			for (let host of json.hosts) {
				const auth = encodeURIComponent(json.auth) // the auth token
				const url = `https://${host.hostname}${MediaPathMap[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`

				try {
					const result = await this.fetchRequest(url, 'POST', body, options.uploadAgent, {
						'Content-Type': 'application/octet-stream'
					})
					mediaUrl = result && result.url ? result.url : undefined

					if (mediaUrl) break
					else {
						json = await this.refreshMediaConn(true)
						throw new Error(`upload failed, reason: ${JSON.stringify(result)}`)
					}
				} catch (error) {
					const isLast = host.hostname === json.hosts[json.hosts.length - 1].hostname
					this.logger.error(`Error in uploading to ${host.hostname}${isLast ? '' : ', retrying...'}`)
				}
			}
			if (!mediaUrl) throw new Error('Media upload failed on all hosts')

			await Promise.all(
				[
					fs.promises.unlink(encBodyPath),
					didSaveToTmpPath && bodyPath && fs.promises.unlink(bodyPath)
				]
				.filter(f => typeof f == 'boolean')
			)

			const message = {
				[mediaType]: MessageTypeProto[mediaType].fromObject({
					url: mediaUrl,
					mediaKey: mediaKey,
					mimetype: options.mimetype,
					fileEncSha256: fileEncSha256,
					fileSha256: fileSha256,
					fileLength: fileLength,
					seconds: options.duration,
					fileName: options.filename || 'file',
					gifPlayback: isGIF || undefined,
					caption: options.caption,
					ptt: options.ptt,
					viewOnce: options.viewOnce
				})
			}
			return WAMessageProto.Message.fromObject(message) // as WAMessageContent
		}

		/**
		 * getBuffer hehe
		 * @param {String|Buffer} path 
		 */
		async getFile(path) {
			let res
			let data = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,` [1], 'base64') : /^https?:\/\//.test(path) ? await (res = await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : typeof path === 'string' ? path : Buffer.alloc(0)
			if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer')
			let type = await FileType.fromBuffer(data) || {
				mime: 'application/octet-stream',
				ext: '.bin'
			}

			return {
				res,
				...type,
				data
			}
		}

		/**
		 * Send Media/File with Automatic Type Specifier
		 * @param {String} jid 
		 * @param {String|Buffer} path 
		 * @param {String} filename 
		 * @param {String} caption 
		 * @param {Object} quoted 
		 * @param {Boolean} ptt 
		 * @param {Object} options 
		 */
		async sendFile(jid, path, filename = '', caption = '', quoted = '', ptt = false, options = {}) {
			let type = await this.getFile(path)
			let { res, data: file } = type
			if (res && res.status !== 200 || file.length <= 65536) {
				try {
					throw {
						json: JSON.parse(file.toString())
					}
				} catch (e) {
					if (e.json) throw e.json
				}
			}
			let opt = { filename, caption }
			if (quoted) opt.quoted = quoted
			if (!type)
			if (options.asDocument) options.asDocument = true
			let mtype = ''
			if (options.asSticker) mtype = MessageType.sticker
			else if (!options.asDocument && !options.type) {
				if (options.force) file = file
				else if (/audio/.test(type.mime)) file = await (ptt ? toPTT : toAudio)(file, type.ext)
				else if (/video/.test(type.mime)) file = await toVideo(file, type.ext)
				if (/webp/.test(type.mime) && file.length <= 1 << 20) mtype = MessageType.sticker
				else if (/image/.test(type.mime)) mtype = MessageType.image
				else if (/video/.test(type.mime)) mtype = MessageType.video
				else opt.displayName = opt.caption = filename
				if (options.asGIF && mtype === MessageType.video) mtype = MessageType.gif
				if (/audio/.test(type.mime)) {
					mtype = MessageType.audio
					if (!ptt) opt.mimetype = 'audio/mp4'
					opt.ptt = ptt
				} else if (/pdf/.test(type.ext)) mtype = MessageType.pdf
				else if (!mtype) {
					mtype = MessageType.document
					opt.mimetype = type.mime
				}
			} else {
				mtype = options.type ? options.type : MessageType.document
				opt.mimetype = type.mime
			}
			delete options.asDocument
			delete options.asGIF
			delete options.asSticker
			delete options.type
			if (mtype === MessageType.document) opt.title = filename
			if (mtype === MessageType.sticker || !opt.caption) delete opt.caption
			return await this.sendMessage(jid, file, mtype, { ...opt, ...options
			})
		}

		/**
		 * Reply to a message
		 * @param {String} jid 
		 * @param {String|Object} text 
		 * @param {Object} quoted 
		 * @param {Object} options 
		 */
		reply(jid, text, quoted, options) {
			return Buffer.isBuffer(text) ? this.sendFile(jid, text, 'file', '', quoted, false, options) : this.sendMessage(jid, text, MessageType.extendedText, { quoted, ...options })
		}

	 /**
     * Send Buttons
     * @param {String} jid
     * @param {String} content
     * @param {String} footer
     * @param {String} button1
     * @param {String} row1
     * @param {Object} quoted
     * @param {Object} options
     */
    async sendButton(jid, content, footer, button1, row1, quoted, options = {}) {
      return await this.sendMessage(jid, {
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 }
        ],
        headerType: 1
      }, MessageType.buttonsMessage, { quoted, ...options })
    }
    async send2Button(jid, content, footer, button1, row1, button2, row2, quoted, options = {}) {
      return await this.sendMessage(jid, {
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 },
          { buttonId: row2, buttonText: { displayText: button2 }, type: 1 }
        ],
        headerType: 1
      }, MessageType.buttonsMessage, { quoted, ...options })
    }
    async send3Button(jid, content, footer, button1, row1, button2, row2, button3, row3, options = {}) {
      return await this.sendMessage(jid, {
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 },
          { buttonId: row2, buttonText: { displayText: button2 }, type: 1 },
          { buttonId: row3, buttonText: { displayText: button3 }, type: 1 }
        ],
        headerType: 1
      }, MessageType.buttonsMessage, { quoted, ...options })
    }

    /**
     * Send Button with Image
     * @param {String} jid
     * @param {Buffer} buffer
     * @param {String} content
     * @param {String} footer
     * @param {String} button1
     * @param {String} row1
     * @param {String} button2
     * @param {String} row2
     * @param {String} button3
     * @param {String} row3
     * @param {Object} quoted
     * @param {Object} options
     */
    async sendButtonImg(jid, path, content, footer, button1, row1, quoted, options = {}) {
	    let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      return await this.sendMessage(jid, {
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 }
        ],
        headerType: 4,
        imageMessage: (await this.prepareMessageMedia(buffer, MessageType.image, {})).imageMessage
      }, MessageType.buttonsMessage, {
        quoted, ...options
      })
    }
    async send2ButtonImg(jid, path, content, footer, button1, row1, button2, row2, quoted, options = {}) {
	    let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      return await this.sendMessage(jid, {
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 },
          { buttonId: row2, buttonText: { displayText: button2 }, type: 1 }
        ],
        headerType: 4,
        imageMessage: (await this.prepareMessageMedia(buffer, MessageType.image, {})).imageMessage
      }, MessageType.buttonsMessage, {
        quoted, ...options
      })
    }
    async send3ButtonImg(jid, path, content, footer, button1, row1, button2, row2, button3, row3, quoted, options = {}) {
	    let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      return await this.sendMessage(jid, {
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 },
          { buttonId: row2, buttonText: { displayText: button2 }, type: 1 },
          { buttonId: row3, buttonText: { displayText: button3 }, type: 1 }
        ],
        headerType: 4,
        imageMessage: (await this.prepareMessageMedia(buffer, MessageType.image, {})).imageMessage
      }, MessageType.buttonsMessage, {
        quoted, ...options
      })
    }

    /**
         * Send Buttons with Location
         * @param {String} jid
         * @param {Buffer} buffer
         * @param {String} content
         * @param {String} footer
         * @param {String} button1
         * @param {String} row1
         * @param {String} button2
         * @param {String} row2
         * @param {String} button3
         * @param {String} row3
         * @param {Object} quoted
         * @param {Object} options
         */
    async sendButtonLoc(jid, path, content, footer, button1, row1, quoted, options = {}) {
	let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      return await this.sendMessage(jid, {
        locationMessage: { jpegThumbnail: buffer },
        contentText: content,
        footerText: footer,
        buttons: [{ buttonId: row1, buttonText: { displayText: button1 }, type: 1 }],
        headerType: 6
      }, MessageType.buttonsMessage, { quoted, ...options })
    }
    async send2ButtonLoc(jid, path, content, footer, button1, row1, button2, row2, quoted, options = {}) {
	    let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      return await this.sendMessage(jid, {
        locationMessage: { jpegThumbnail: buffer },
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 },
          { buttonId: row2, buttonText: { displayText: button2 }, type: 1 }
        ],
        headerType: 6
      }, MessageType.buttonsMessage, { quoted, ...options })
    }
    async send3ButtonLoc(jid, path, content, footer, button1, row1, button2, row2, button3, row3, quoted, options = {}) {
	let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      return await this.sendMessage(jid, {
        locationMessage: { jpegThumbnail: buffer },
        contentText: content,
        footerText: footer,
        buttons: [
          { buttonId: row1, buttonText: { displayText: button1 }, type: 1 },
          { buttonId: row2, buttonText: { displayText: button2 }, type: 1 },
          { buttonId: row3, buttonText: { displayText: button3 }, type: 1 }
        ],
        headerType: 6
      }, MessageType.buttonsMessage, { quoted, ...options })
    }

		
		sendTextWithMentions(jid, text, quoted) {
            return this.sendMessage(jid, text, MessageType.extendedText, { quoted, contextInfo: { mentionedJid: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net')}})
        }
		
		/**
		 * Fake Replies
		 * @param {String} jid 
		 * @param {String|Object} text 
		 * @param {String} fakeJid 
		 * @param {String} fakeText 
		 * @param {String} fakeGroupJid 
		 * @param {String} options 
		 */
		fakeReply(jid, text = '', fakeJid = this.user.jid, fakeText = '', fakeGroupJid, options) {
			return this.reply(jid, text, { key: { fromMe: fakeJid == this.user.jid, participant: fakeJid, ...(fakeGroupJid ? { remoteJid: fakeGroupJid } : {}) }, message: { conversation: fakeText }, ...options })
		}

		/**
		 * Fake replies #2
		 * @param {String} jid 
		 * @param {String|Object} message 
		 * @param {String} type 
		 * @param {String} sender 
		 * @param {String|Object} message2 
		 * @param {String} type2 
		 * @param {Object} options 
		 * @param {Object} options2 
		 * @param {String} remoteJid 
		 */
		async fakeReply2(jid, message, type, sender, message2, type2, options = {}, options2 = {}, remoteJid) {
			let quoted = await this.prepareMessage(jid, message2, type2, options2)
			quoted = this.cMod(jid, quoted, undefined, sender)
			if (remoteJid) quoted.key.remoteJid = remoteJid
			else delete quoted.key.remoteJid

			return await this.prepareMessage(jid, message, type, {
				quoted,
				...options
			})
		}

		/**
		 * Parses string into mentionedJid(s)
		 * @param {String} text 
		 */
		parseMention(text = '') {
			return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
		}

		/**
		 * Get name from jid
		 * @param {String} jid 
		 * @param {Boolean} withoutContact
		 */
		getName(jid, withoutContact = false) {
      withoutContact = this.withoutContact || withoutContact
      let chat
      let v = jid.endsWith('@g.us') ? (chat = this.chats.get(jid) || {}) && chat.metadata || {} : jid === '0@s.whatsapp.net' ? {
        jid,
        vname: 'WhatsApp'
      } : jid === this.user.jid ?
        this.user :
        this.contactAddOrGet(jid)
        return (withoutContact ? (v.notify || v.vnmae || v.name || v.short) : v.name || v.subject || v.vname || v.short || v.notify) || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
      }

		/**
		 * Download media message
		 * @param {Object} m 
		 */
		async downloadM(m) {
			if (!m) return Buffer.alloc(0)
			if (!m.message) m.message = {
				m
			}
			if (!m.message[Object.keys(m.message)[0]].url) await this.updateMediaMessage(m)
			return await this.downloadMediaMessage(m)
		}

		/**
		 * Serialize Message, so it easier to manipulate
		 * @param {Object} m 
		 */
		serializeM(m) {
			return exports.smsg(this, m)
		}
	}

	return WAConnection
}

/**
 * Serialize Message
 * @param {WAConnection} conn 
 * @param {Object} m 
 * @param {Boolean} hasParent 
 */
exports.smsg = (conn, m, hasParent) => {
	if (!m) return m
	let M = WAMessageProto.WebMessageInfo
	if (m.key) {
		m.id = m.key.id
		m.isBaileys = m.id.startsWith('3EB0') && m.id.length === 12
		m.chat = m.key.remoteJid
		m.fromMe = m.key.fromMe
		m.isGroup = m.chat.endsWith('@g.us')
		m.sender = m.fromMe ? conn.user.jid : m.participant ? m.participant : m.key.participant ? m.key.participant : m.chat
	}
	if (m.message) {
		m.mtype = Object.keys(m.message)[0]
		m.body = m.message.conversation || m.message[m.mtype].caption || m.message[m.mtype].text || (m.mtype == 'listResponseMessage') && m.message[m.mtype].singleSelectReply.selectedRowId || (m.mtype == 'buttonsResponseMessage') && m.message[m.mtype].selectedButtonId || m.mtype
		m.msg = m.message[m.mtype]
		if (m.mtype === 'ephemeralMessage') {
			exports.smsg(conn, m.msg)
			m.mtype = m.msg.mtype
			m.msg = m.msg.msg
		}
		let quoted = m.quoted = m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null
		m.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
		if (m.quoted) {
			let type = Object.keys(m.quoted)[0]
			m.quoted = m.quoted[type]
			if (['productMessage'].includes(type)) {
				type = Object.keys(m.quoted)[0]
				m.quoted = m.quoted[type]
			}
			if (typeof m.quoted === 'string') m.quoted = {
				text: m.quoted
			}
			m.quoted.mtype = type
			m.quoted.id = m.msg.contextInfo.stanzaId
			m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
			m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('3EB0') && m.quoted.id.length === 12 : false
			m.quoted.sender = m.msg.contextInfo.participant
			m.quoted.fromMe = m.quoted.sender === (conn.user && conn.user.jid)
			m.quoted.text = m.quoted.text || m.quoted.caption || ''
			m.quoted.mentionedJid = m.quoted.contextInfo ? m.quoted.contextInfo.mentionedJid : []
			m.getQuotedObj = m.getQuotedMessage = async () => {
				if (!m.quoted.id) return false
				let q = await conn.loadMessage(m.chat, m.quoted.id)
				return exports.smsg(conn, q)
			}
		let vM = m.quoted.fakeObj = M.fromObject({
            key: {
            fromMe: m.quoted.fromMe,
            remoteJid: m.quoted.chat,
            id: m.quoted.id
        },
            message: quoted,
        ...(m.isGroup ? { participant: m.quoted.sender } : {})
      })
      if (m.quoted.url) m.quoted.download = (type = 'buffer') => conn.downloadM(vM, type)
			/**
			 * Reply to quoted message
			 * @param {String|Object} text 
			 * @param {String|false} chatId 
			 * @param {Object} options 
			 */
			m.quoted.reply = (text, chatId, options) => conn.reply(chatId ? chatId : m.chat, text, vM, options)
			/**
			 * Copy quoted message
			 */
			m.quoted.copy = () => exports.smsg(conn, M.fromObject(M.toObject(vM)))
			/**
			 * Forward quoted message
			 * @param {String} jid 
			 * @param {Boolean} forceForward 
			 */
			m.quoted.forward = (jid, forceForward = false) => conn.forwardMessage(jid, vM, forceForward)
			/**
			 * Exact Forward quoted message
			 * @param {String} jid 
			 * @param {Boolean} forceForward 
			 * @param {Object} options 
			 */
			m.quoted.copyNForward = (jid, forceForward = false, options = {}) => conn.copyNForward(jid, vM, forceForward, options)
			/**
			 * Modify quoted Message
			 * @param {String} jid 
			 * @param {String} text 
			 * @param {String} sender 
			 * @param {Object} options 
			 */
			m.quoted.cMod = (jid, text = '', sender = m.quoted.sender, options = {}) => conn.cMod(jid, vM, text, sender, options)
			/**
			 * Delete quoted message
			 */
			m.quoted.delete = () => conn.deleteMessage(m.quoted.chat, vM.key)
		}
		if (m.msg.url) m.download = (type = 'buffer') => conn.downloadM(m, type)
		m.text = (m.mtype == 'listResponseMessage' ? m.msg.singleSelectReply.selectedRowId : '') || m.msg.text || m.msg.caption || m.msg || ''
		/**
		 * Reply to this message
		 * @param {String|Object} text 
		 * @param {String|false} chatId 
		 * @param {Object} options 
		 */
		m.reply = (text, chatId, options) => conn.reply(chatId ? chatId : m.chat, text, m, { detectLinks: false, thumbnail: global.thumb, ...options })
		/**
		 * Copy this message
		 */
		m.copy = () => exports.smsg(conn, M.fromObject(M.toObject(m)))
		/**
		 * Forward this message
		 * @param {String} jid 
		 * @param {Boolean} forceForward 
		 */
		m.forward = (jid = m.chat, forceForward = false) => conn.forwardMessage(jid, m, forceForward)
		/**
		 * Exact Forward this message
		 * @param {String} jid 
		 * @param {Boolean} forceForward 
		 * @param {Object} options 
		 */
		m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => conn.copyNForward(jid, m, forceForward, options)
		/**
		 * Modify this Message
		 * @param {String} jid 
		 * @param {String} text 
		 * @param {String} sender 
		 * @param {Object} options 
		 */
		m.cMod = (jid, text = '', sender = m.sender, options = {}) => conn.cMod(jid, m, text, sender, options)
	}
	return m
}

exports.logic = (check, inp, out) => {
	if (inp.length !== out.length) throw new Error('Input and Output must have same length')
	for (let i in inp)
		if (util.isDeepStrictEqual(check, inp[i])) return out[i]
	return null
}
exports.generateProfilePicture = async (buffer) => {
	const jimp = await jimp_1.read(buffer)
	const min = jimp.getWidth()
	const max = jimp.getHeight()
	const cropped = jimp.crop(0, 0, min, max)
	return {
		img: await cropped.scaleToFit(720, 720).getBufferAsync(jimp_1.MIME_JPEG),
		preview: await cropped.scaleToFit(720, 720).getBufferAsync(jimp_1.MIME_JPEG)
	}
}
exports.processTime = (timestamp, now) => {
	return moment.duration(now - moment(timestamp * 1000)).asSeconds()
}
exports.getRandom = (ext) => {
    return `${Math.floor(Math.random() * 10000)}${ext}`
}
exports.getBuffer = async (url, options) => {
	try {
		options ? options : {}
		const res = await axios({
			method: "get",
			url,
			headers: {
				'DNT': 1,
				'Upgrade-Insecure-Request': 1
			},
			...options,
			responseType: 'arraybuffer'
		})
		return res.data
	} catch (e) {
		console.log(`Error : ${e}`)
	}
}
exports.fetchJson = fetchJson = (url, options) => new Promise(async (resolve, reject) => {
    fetch(url, options)
        .then(response => response.json())
        .then(json => {
            resolve(json)
        })
        .catch((err) => {
            reject(err)
        })
})
exports.fetchText = fetchText = (url, options) => new Promise(async (resolve, reject) => {
    fetch(url, options)
        .then(response => response.text())
        .then(text => {
            // console.log(text)
            resolve(text)
        })
        .catch((err) => {
            reject(err)
        })
})
exports.getGroupAdmins = function(participants){
    let admins = []
	for (let i of participants) {
		i.isAdmin ? admins.push(i.jid) : ''
	}
	return admins
}

exports.runtime = function(seconds) {
	seconds = Number(seconds);
	var d = Math.floor(seconds / (3600 * 24));
	var h = Math.floor(seconds % (3600 * 24) / 3600);
	var m = Math.floor(seconds % 3600 / 60);
	var s = Math.floor(seconds % 60);
	var dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
	var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
	var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
	var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
	return dDisplay + hDisplay + mDisplay + sDisplay;
}
exports.clockString = function(seconds) {
    let h = isNaN(seconds) ? '--' : Math.floor(seconds % (3600 * 24) / 3600)
    let m = isNaN(seconds) ? '--' : Math.floor(seconds % 3600 / 60)
    let s = isNaN(seconds) ? '--' : Math.floor(seconds % 60)
    return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':')
}
exports.sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.getTime = (format, date) => {
	if (date) {
		return moment(date).locale('id').format(format)
	} else {
		return moment.tz('Asia/Jakarta').locale('id').format(format)
	}
}
exports.formatDate = (n, locale = 'id') => {
	let d = new Date(n)
	return d.toLocaleDateString(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric'
	})
}
exports.tanggal = (numer) => {
	myMonths = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
				myDays = ['Minggu','Senin','Selasa','Rabu','Kamis','Jum’at','Sabtu']; 
				var tgl = new Date(numer);
				var day = tgl.getDate()
				bulan = tgl.getMonth()
				var thisDay = tgl.getDay(),
				thisDay = myDays[thisDay];
				var yy = tgl.getYear()
				var year = (yy < 1000) ? yy + 1900 : yy; 
				const time = moment.tz('Asia/Jakarta').format('DD/MM HH:mm:ss')
				let d = new Date
				let locale = 'id'
				let gmt = new Date(0).getTime() - new Date('1 January 1970').getTime()
				let weton = ['Pahing', 'Pon','Wage','Kliwon','Legi'][Math.floor(((d * 1) + gmt) / 84600000) % 5]
				
				return`${thisDay}, ${day} - ${myMonths[bulan]} - ${year}`
	}
	exports.formatp = sizeFormatter({
		std: 'JEDEC', //'SI' = default | 'IEC' | 'JEDEC'
		decimalPlaces: 2,
		keepTrailingZeroes: false,
		render: (literal, symbol) => `${literal} ${symbol}B`,
	})
exports.jsonformat = (string) => {
		return JSON.stringify(string, null, 2)
}
/**
 * generateThumbnail
 * @param {String} file 
 * @param {*} mediaType 
 * @param {*} info 
 */
async function generateThumbnail(file, mediaType, info) {
	const alternate = (Buffer.alloc(1)).toString('base64')
	if ('thumbnail' in info) {
		// don't do anything if the thumbnail is already provided, or is null
		if (mediaType === MessageType.audio) {
			throw new Error('audio messages cannot have thumbnails')
		}
	} else if (mediaType === MessageType.image) {
		try {
			const buff = await compressImage(file)
			info.thumbnail = buff.toString('base64')
		} catch (err) {
			console.error(err)
			info.thumbnail = alternate
		}
	} else if (mediaType === MessageType.video) {
		const imgFilename = path.join(tmpdir(), generateMessageID() + '.jpg')
		try {
			try {
				await extractVideoThumb(file, imgFilename, '00:00:00', { width: 48, height: 48 })
				const buff = await fs.promises.readFile(imgFilename)
				info.thumbnail = buff.toString('base64')
				await fs.promises.unlink(imgFilename)
			} catch (e) {
				console.error(e)
				info.thumbnail = alternate
			}
		} catch (err) {
			console.log('could not generate video thumb: ' + err)
		}
	}
}

/**
 * 
 * @param {String} path 
 * @param {*} destPath 
 * @param {String} time ('00:00:00')
 * @param {{width: Number, height: Number}} size 
 * @returns 
 */
const extractVideoThumb = async (
		path,
		destPath,
		time,
		size = {},
	) =>
	new Promise((resolve, reject) => {
		const cmd = `ffmpeg -ss ${time} -i ${path} -y -s ${size.width}x${size.height} -vframes 1 -f image2 ${destPath}`
		exec(cmd, (err) => {
			if (err) reject(err)
			else resolve()
		})
	})

/**
 * download video from url or buffer
 * @param {String|Buffer} media 
 * @returns Buffer
 */
async function download(media, mime, callback) {
	if (Buffer.isBuffer(media)) {
		if (typeof callback == 'function') await callback({
			buffer: media,
			filename: ''
		})
		return media
	}
	let filename = path.join(__dirname, '../tmp/' + new Date * 1 + '.' + mime)
	let buffer
	try {
		let totalErr = 0
		await request(media).pipe(await fs.createWriteStream(filename)).on('finish', async () => {
			buffer = await fs.readFileSync(filename)
			if (typeof callback == 'function') await callback({
				buffer,
				filename
			})
		})
		if (fs.existsSync(filename)) await fs.unlinkSync(filename)
		return filename
	} catch (err) {
		try {
			let res = await fetch(media)
			await res.body.pipe(await fs.createWriteStream(filename)).on('finish', async () => {
				buffer = await fs.readFileSync(filename)
				if (typeof callback == 'function') await callback({
					buffer,
					filename
				})
			})
			if (fs.existsSync(filename)) await fs.unlinkSync(filename)
			return filename
		} catch (e) {
			throw e
		}
	}
	return filename
}

function delay(ms) {
	return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

function format(...args) {
	return util.format(...args)
}


const chalk = require('chalk')
let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright("Update 'simple.js'"))
	delete require.cache[file]
	require(file)
})
