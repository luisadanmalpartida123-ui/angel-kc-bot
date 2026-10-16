// Silenciar warnings de Node y logs de depuración
process.env.NODE_NO_WARNINGS = '1';
console.debug = () => {};

import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import axios from 'axios';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

// ⚠️ INGRESA AQUÍ TU NÚMERO DE WHATSAPP (Ejemplo para Perú: '51987654321')
const NUMERO_WHATSAPP = '51XXXXXXXXX';

const ultimosGacha = {};
const colecciones = {};

// Detectar automáticamente el entorno (Windows local vs Linux/Docker en Render)
const isWindows = process.platform === 'win32';
const ytdlpPath = isWindows ? path.join(process.cwd(), 'yt-dlp.exe') : 'yt-dlp';

// Función para obtener personaje desde AniList
async function obtenerPersonajeAniList() {
    const randomPage = Math.floor(Math.random() * 100) + 1;

    const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 1) {
        characters(sort: FAVOURITES_DESC) {
          id
          name {
            full
          }
          image {
            large
          }
          media(perPage: 1, sort: POPULARITY_DESC) {
            nodes {
              title {
                romaji
                english
              }
            }
          }
        }
      }
    }
    `;

    try {
        const response = await axios.post('https://graphql.anilist.co', {
            query: query,
            variables: { page: randomPage }
        });

        const character = response.data.data.Page.characters[0];
        const animeTitle = character.media.nodes[0]?.title?.english || character.media.nodes[0]?.title?.romaji || "Desconocido";

        return {
            id: character.id,
            nombre: character.name.full,
            anime: animeTitle,
            imagen: character.image.large,
            rareza: "⭐️⭐️⭐️⭐️⭐️"
        };
    } catch (error) {
        console.error("Error al consultar AniList API:", error.message);
        return {
            id: 1,
            nombre: "Gojo Satoru",
            anime: "Jujutsu Kaisen",
            imagen: "https://s4.anilist.co/file/anilistcdn/character/large/b126336-e0R7a2pZq10n.png",
            rareza: "⭐️⭐️⭐️⭐️⭐️"
        };
    }
}

// Búsqueda de archivos generados por prefijo
function buscarArchivoPorPrefijo(prefix) {
    const files = fs.readdirSync(process.cwd());
    const found = files.find(file => file.startsWith(prefix));
    return found ? path.join(process.cwd(), found) : null;
}

// Limpieza automática de temporales
function limpiarArchivosTemporales(prefix) {
    try {
        const files = fs.readdirSync(process.cwd());
        files.forEach(file => {
            if (file.startsWith(prefix) || file.startsWith('temp_video_') || file.startsWith('temp_audio_')) {
                const fullPath = path.join(process.cwd(), file);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        });
    } catch (e) {
        console.error("Error al limpiar carpeta:", e.message);
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false
    });

    sock.unofficial = true;

    // Generar código de vinculación de 8 dígitos si no existe sesión
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(NUMERO_WHATSAPP);
                console.log('\n==================================================');
                console.log(`🔑 CÓDIGO DE VINCULACIÓN PARA WHATSAPP: ${code}`);
                console.log('==================================================\n');
            } catch (err) {
                console.error("Error al solicitar el código de vinculación:", err.message);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Angel-KC conectado con éxito a WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const messageType = Object.keys(m.message)[0];
        let body = '';

        if (messageType === 'conversation') {
            body = m.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            body = m.message.extendedTextMessage.text;
        }

        const sender = m.key.remoteJid;
        const texto = body.trim();

        if (!texto.startsWith('#')) return;

        const args = texto.slice(1).split(' ');
        const comando = args[0].toLowerCase();
        const textArgs = texto.split(' ').slice(1).join(' ');

        switch (comando) {
            case 'ping':
                await sock.sendMessage(sender, { text: 'Pong! 🏓 La velocidad del bot es óptima.' });
                break;

            case 'dado':
                const resultadoDado = Math.floor(Math.random() * 6) + 1;
                await sock.sendMessage(sender, { text: `🎲 Lanzaste el dado y salió: *${resultadoDado}*` });
                break;

            case 'menu':
            case 'help':
                const menuTexto = 
`¡Hola! Soy Angel-KC (Bot 24/7)

AQUÍ TIENES LA LISTA DE COMANDOS:

⚙️ *COMANDOS GENERALES:*
  • #ping : Muestra la velocidad del bot
  • #dado : Lanza un dado al azar (1-6)
  • #menu : Muestra esta lista

📥 *DESCARGAS & CREATIVIDAD:*
  • #play <nombre/link> : Descarga música
  • #video <nombre/link> : Descarga un video en MP4 con audio
  • #ia <descripción> : Genera una imagen con Inteligencia Artificial

🍔 *APARTADO GACHA (ANIME):*
  • #gacha : Tira por un personaje al azar
  • #claim : Reclama el personaje obtenido en el último #gacha
  • #mi-coleccion : Revisa tu lista de personajes reclamados`;

                await sock.sendMessage(sender, {
                    image: { url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQVzIr811dwStPuHgUO0BdXAPMdDI93c_Qzy_Ct_lV64A&s' },
                    caption: menuTexto
                });
                break;

            case 'play':
                if (!textArgs) {
                    await sock.sendMessage(sender, { text: '⚠️ Ingresa el nombre o enlace de la canción. Ejemplo:\n*#play Kasane Teto Territory*' });
                    return;
                }

                const tempPrefixAudio = `temp_audio_${Date.now()}`;
                try {
                    await sock.sendMessage(sender, { text: '🎵 Procesando audio, por favor espera...' });

                    let query = textArgs.startsWith('http') ? textArgs : `ytsearch1:${textArgs}`;
                    const outputTemplate = path.join(process.cwd(), `${tempPrefixAudio}.%(ext)s`);

                    const ytdlpArgs = [
                        query,
                        '-f', 'ba[ext=m4a]/ba/b',
                        '--extractor-args', 'youtube:player_client=android,web',
                        '--no-playlist',
                        '-o', outputTemplate
                    ];

                    if (isWindows) {
                        ytdlpArgs.push('--ffmpeg-location', process.cwd());
                    }

                    await execa(ytdlpPath, ytdlpArgs);

                    const archivoGenerado = buscarArchivoPorPrefijo(tempPrefixAudio);

                    if (archivoGenerado && fs.existsSync(archivoGenerado)) {
                        const audioBuffer = fs.readFileSync(archivoGenerado);

                        await sock.sendMessage(sender, {
                            audio: audioBuffer,
                            mimetype: 'audio/mp4',
                            fileName: `${textArgs.slice(0, 20)}.m4a`
                        });
                    } else {
                        throw new Error("No se pudo localizar el archivo de audio.");
                    }

                } catch (err) {
                    console.error("❌ ERROR EN #play:", err.stderr || err.message || err);
                    await sock.sendMessage(sender, { text: '❌ Ocurrió un error al procesar el audio.' });
                } finally {
                    limpiarArchivosTemporales(tempPrefixAudio);
                }
                break;

            case 'video':
                if (!textArgs) {
                    await sock.sendMessage(sender, { text: '⚠️ Ingresa el nombre o enlace del video. Ejemplo:\n*#video trailer jujutsu kaisen*' });
                    return;
                }

                const tempPrefixVideo = `temp_video_${Date.now()}`;
                try {
                    await sock.sendMessage(sender, { text: '🎥 Procesando y optimizando video para WhatsApp, por favor espera...' });

                    let query = textArgs.startsWith('http') ? textArgs : `ytsearch1:${textArgs}`;
                    const outputTemplate = path.join(process.cwd(), `${tempPrefixVideo}.%(ext)s`);

                    const ytdlpArgs = [
                        query,
                        '-f', 'bv*[vcodec^=avc1]+ba[ext=m4a]/bv*[ext=mp4]+ba/b[ext=mp4]/best',
                        '--merge-output-format', 'mp4',
                        '--extractor-args', 'youtube:player_client=android,web',
                        '--postprocessor-args', 'ffmpeg:-c:v copy -c:a aac -ac 2 -ar 44100 -movflags +faststart',
                        '--no-playlist',
                        '-o', outputTemplate
                    ];

                    if (isWindows) {
                        ytdlpArgs.push('--ffmpeg-location', process.cwd());
                    }

                    await execa(ytdlpPath, ytdlpArgs);

                    const archivoGenerado = buscarArchivoPorPrefijo(tempPrefixVideo);

                    if (archivoGenerado && fs.existsSync(archivoGenerado)) {
                        const videoBuffer = fs.readFileSync(archivoGenerado);

                        await sock.sendMessage(sender, {
                            video: videoBuffer,
                            caption: `🎬 Video procesado correctamente con audio`,
                            mimetype: 'video/mp4'
                        });
                    } else {
                        throw new Error("No se pudo localizar el archivo de video generado.");
                    }

                } catch (err) {
                    console.error("❌ ERROR EN #video:", err.stderr || err.message || err);
                    await sock.sendMessage(sender, { text: '❌ Ocurrió un error al procesar el video.' });
                } finally {
                    limpiarArchivosTemporales(tempPrefixVideo);
                }
                break;

            case 'ia':
            case 'imagen':
                if (!textArgs) {
                    await sock.sendMessage(sender, { text: '⚠️ Escribe una descripción de la imagen. Ejemplo:\n*#ia kasane teto anime style*' });
                    return;
                }

                try {
                    const promptEncoded = encodeURIComponent(textArgs);
                    const imageUrl = `https://image.pollinations.ai/prompt/${promptEncoded}?width=1024&height=1024&seed=${Math.floor(Math.random() * 99999)}&nologo=true`;

                    await sock.sendMessage(sender, {
                        image: { url: imageUrl },
                        caption: `🎨 *Imagen generada por IA*\n\n📝 Prompt: _${textArgs}_`
                    });
                } catch (err) {
                    console.error("Error en #ia:", err);
                    await sock.sendMessage(sender, { text: '❌ No se pudo generar la imagen por IA.' });
                }
                break;

            case 'gacha':
                const personaje = await obtenerPersonajeAniList();
                ultimosGacha[sender] = personaje;

                const textoGacha = `✨ ¡Has invocado el gacha!\n\nHas obtenido a:\n👤 *${personaje.nombre}*\n📺 Anime: ${personaje.anime}\nRareza: ${personaje.rareza}\n\nEscribe *#claim* para agregarlo a tu colección.`;

                await sock.sendMessage(sender, { 
                    image: { url: personaje.imagen },
                    caption: textoGacha
                });
                break;

            case 'claim':
                const ultimo = ultimosGacha[sender];
                if (!ultimo) {
                    await sock.sendMessage(sender, { text: '❌ No tienes ningún personaje pendiente por reclamar. Usa primero *#gacha*.' });
                    return;
                }

                if (!colecciones[sender]) {
                    colecciones[sender] = [];
                }

                colecciones[sender].push(ultimo);
                delete ultimosGacha[sender];

                await sock.sendMessage(sender, { text: `🎉 ¡Has reclamado a *${ultimo.nombre}* con éxito!` });
                break;

            case 'mi-coleccion':
                const misPersonajes = colecciones[sender];
                if (!misPersonajes || misPersonajes.length === 0) {
                    await sock.sendMessage(sender, { text: '📂 Tu colección está vacía. Usa *#gacha* y luego *#claim* para conseguir personajes.' });
                    return;
                }

                let listaMsg = `📂 *TU COLECCIÓN DE PERSONAJES*:\n\n`;
                misPersonajes.forEach((p, index) => {
                    listaMsg += `${index + 1}. *${p.nombre}* (${p.anime}) - ${p.rareza}\n`;
                });

                await sock.sendMessage(sender, { text: listaMsg });
                break;

            default:
                await sock.sendMessage(sender, { text: '❌ Comando no reconocido. Escribe *#menu* para ver la lista de comandos disponibles.' });
                break;
        }
    });
}

connectToWhatsApp();
