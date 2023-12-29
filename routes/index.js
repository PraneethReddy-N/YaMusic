const express = require('express');
const router = express.Router();
const multer = require('multer');
const {SpeechClient} = require('@google-cloud/speech');
const stream = require('stream');
const upload = multer();
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const SpotifyWebApi = require('spotify-web-api-node');

const speechClient = new SpeechClient();

ffmpeg.setFfmpegPath(String.raw`C:\\Users\\prane\\Downloads\\ffmpeg-6.1-essentials_build\\ffmpeg-6.1-essentials_build\\bin\\ffmpeg.exe`);

const spotifyApi = new SpotifyWebApi({
    clientId:'9ee444a6e12e49d8b88fee7761fce0ad',
    clientSecret:'42b985673bf34b5e8649b8b38466a717',
    redirectUri: 'http://localhost:3000/callback'
});

router.get('/', (req, res) => {
    if (!req.session.accessToken) {
        // Redirect to Spotify login
        const authorizeURL = spotifyApi.createAuthorizeURL(['user-read-playback-state', 'user-modify-playback-state','playlist-read-private']);
        res.redirect(authorizeURL);
    } else {
        // User is authenticated
        res.render('welcome');
    }
});



// Example of a callback route
router.get('/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        const { access_token } = data.body;

        // Store the access token in the session
        req.session.accessToken = access_token;

        // Redirect to the main page
        res.redirect('/');
    } catch (err) {
        console.error('Error during authentication', err);
        res.status(500).send('Authentication error');
    }
});



const deviceId = 'ae518d13ad464a5b22e94af7852b90adb6ca6c43'; // Replace with the actual device ID




    


router.post('/', upload.single('audio'), async (req, res) => {
    console.log('Received audio file from client');
    if (!req.file) {
            return res.status(400).send('No File Uploaded.');
    }
    
    try {
            // Convert audio to Linear16 format
        const audioBuffer = await convertAudioToLinear16(req.file.buffer);
        console.log('Audio conversion started');
        const audioBytes = audioBuffer.toString('base64');
    
        const audio = { content: audioBytes };
        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
        };
            const request = { audio, config };
    
            const [response] = await speechClient.recognize(request);
            console.log(response)
            if (!response || !response.results || !response.results.length) {
                console.error('No transcription results.');
                return res.status(200).json({ transcript: '' });
            }
    
            const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join('\n');
                if (req.session.accessToken) {
                    spotifyApi.setAccessToken(req.session.accessToken);
                } else {
                    // Handle the case where there is no access token
                    return res.status(401).send('Spotify access token is missing');
                }
    
    spotifyApi.transferMyPlayback([deviceId])
    .then(function() {
        console.log('Transfer successful');
    }, function(err) {
        console.log('Something went wrong!', err);
    });
                // Handle commands based on transcription
                if (transcription.toLowerCase().includes('play')) {
                    // If it's a specific play command, search for the song
                    // For example, "play Shape of You by Ed Sheeran"
                    const { songTitle, artistName, movieName } = parseCommand(transcription);

                    if (songTitle) {
                        const songUri = await searchSpotify(songTitle, artistName, movieName);
                        if (songUri) {
                            await spotifyApi.play({ uris: [songUri] });
                        }      
                    } 
                    else {
                        // Resume playback if no specific song is mentioned
                        await spotifyApi.play();
                    }
                } else if (transcription.toLowerCase().includes('stop')) {
                    console.log('in pause');
                    await spotifyApi.pause();
                } else if (transcription.toLowerCase().includes('next')) {
                    console.log('in next');
                    try {
                        await playRandomTrackFromRandomPlaylist();
                    } catch (error) {
                        console.error('Error playing random track:', error);
                        // Handle error (e.g., send a message to the user)
                    }
                }
        
        
                res.json({transcript: transcription});
            
           
            console.log('Sending transcription back to client:', transcription);
        } catch (error) {
            console.error('Error recognizing speech:', error);
            res.status(500).send('Error processing speech to text');
        }
    });
    
    function convertAudioToLinear16(buffer) {
        return new Promise((resolve, reject) => {
            console.log(`Buffer size: ${buffer.length}`);
            const readableStream = new stream.Readable({
                read() {}
            });
            readableStream.push(buffer);
            readableStream.push(null);
    
            const convertedStream = new stream.PassThrough();
            let chunks = [];
    
            const ffmpegCommand = ffmpeg(readableStream)
                .inputFormat('webm')
                .audioCodec('pcm_s16le')
                .audioChannels(1)
                .audioFrequency(48000)
                .format('wav')
                .on('end', () => {
                    console.log('FFmpeg processing finished');
                    const convertedBuffer = Buffer.concat(chunks);
                    resolve(convertedBuffer); // Resolve the promise with the converted buffer
                })
                .on('error', (err) => {
                    console.error('Error during FFmpeg processing:', err);
                    reject(err); // Reject the promise on error
                })
                .pipe(convertedStream, { end: true }); // Allow the PassThrough stream to end when ffmpeg is done
    
            convertedStream
                .on('data', (chunk) => {
                    console.log(`Received chunk of converted audio; size: ${chunk.length}`);
                    chunks.push(chunk);
                })
                .on('error', (err) => {
                    console.error('Error in conversion stream:', err);
                    reject(err); // Reject the promise on error
                });
        });
    }


//  async function searchSongs(songTitle){
//     try{
//         console.log("in search songs");
//         const response = await axios.get(`${JAMENDO_API_URL}/tracks`, {
//             params: {
//                 client_id: CLIENT_ID,
//                 format: 'json',
//                 namesearch: songTitle,
//                 limit: 10
//             }
//         });
//         return response.data.results;
//     }catch(error){
//         console.error('Error fetching songs from Jamendo:', error);
//         return [];
//     }
//  }
function parseCommand(transcription) {
    const artistPattern = /play (.+) by (.+)/i;
    const moviePattern = /play (.+) from (.+)/i;

    let artistMatch = transcription.match(artistPattern);
    let movieMatch = transcription.match(moviePattern);

    if (artistMatch) {
        return { songTitle: artistMatch[1], artistName: artistMatch[2], movieName: null };
    } else if (movieMatch) {
        return { songTitle: movieMatch[1], artistName: null, movieName: movieMatch[2] };
    } else {
        return { songTitle: null, artistName: null, movieName: null };
    }
}


async function searchSpotify(songTitle, artistName, movieName) {
    try {
        let query = `track:${songTitle}`;
        if (artistName) {
            query += ` artist:${artistName}`;
        }
        if (movieName) {
            query += ` album:${movieName}`;
        }

        const response = await spotifyApi.searchTracks(query);
        const tracks = response.body.tracks.items;

        if (tracks.length > 0) {
            return tracks[0].uri;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error searching on Spotify:', error);
        return null;
    }
}


async function getUserPlaylists() {
    try {
        const data = await spotifyApi.getUserPlaylists({ limit: 50 });
        return data.body.items; // Returns a list of playlists
    } catch (error) {
        console.error('Error fetching user playlists:', error);
        return [];
    }
}

async function playRandomTrackFromRandomPlaylist() {
    const playlists = await getUserPlaylists();

    if (playlists.length === 0) {
        throw new Error('No playlists found');
    }

    const randomPlaylistIndex = Math.floor(Math.random() * playlists.length);
    const playlistId = playlists[randomPlaylistIndex].id;
    const trackUris = await getPlaylistTracks(playlistId);

    if (trackUris.length === 0) {
        throw new Error('Playlist is empty');
    }

    const randomTrackUri = selectRandomTrack(trackUris);
    await spotifyApi.play({ uris: [randomTrackUri] });
}

async function getPlaylistTracks(playlistId) {
    try {
        const response = await spotifyApi.getPlaylistTracks(playlistId, {
            limit: 100 // You can adjust the limit as needed
        });
        return response.body.items.map(item => item.track.uri);
    } catch (error) {
        console.error('Error fetching playlist tracks:', error);
        return [];
    }
}
function selectRandomTrack(trackUris) {
    if (trackUris.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * trackUris.length);
    return trackUris[randomIndex];
}




    
module.exports = router;