// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyBUz5w9wOt1DJ6URheQtQyDmmKfUY1miWc",
    authDomain: "player-game-1d034.firebaseapp.com",
    databaseURL: "https://player-game-1d034-default-rtdb.firebaseio.com",
    projectId: "player-game-1d034",
    storageBucket: "player-game-1d034.firebasestorage.app",
    messagingSenderId: "496095734585",
    appId: "1:496095734585:web:18c5b634f89ff13e4a16e8"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- 2. GAME STATE VARIABLES ---
let currentRoom = null;
let myPlayerId = 'player_' + Math.random().toString(36).substr(2, 9);
let isHost = false;
let myName = "";
let roomRef = null;

const avatars = ["😎", "🤠", "👽", "👻", "🦊", "🐼", "🦄", "🌸"];
const myAvatar = avatars[Math.floor(Math.random() * avatars.length)];

// Background Hearts Animation
function createFloatingHearts() {
    const container = document.getElementById('particles');
    setInterval(() => {
        const heart = document.createElement('div');
        heart.innerHTML = '💖';
        heart.className = 'floating-heart';
        heart.style.left = Math.random() * 100 + 'vw';
        heart.style.animationDuration = (Math.random() * 5 + 5) + 's';
        heart.style.fontSize = (Math.random() * 1.5 + 0.5) + 'rem';
        container.appendChild(heart);
        setTimeout(() => heart.remove(), 10000);
    }, 600);
}
createFloatingHearts();

// Vibrate helper for mobile
function vibratePhone(ms = 50) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

// --- 3. UI NAVIGATION ---
function showScreen(screenId) {
    ['home-screen', 'lobby-screen', 'game-screen', 'result-screen'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
        document.getElementById(id).classList.remove('screen-active');
    });
    document.getElementById(screenId).classList.remove('hidden');
    document.getElementById(screenId).classList.add('screen-active');
}

// --- 4. ROOM MANAGEMENT ---
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function createRoom() {
    vibratePhone();
    const code = generateRoomCode();
    currentRoom = code;
    isHost = true;
    myName = prompt("Enter your name:") || "Player 1";

    roomRef = db.ref(`rooms/${code}`);
    await roomRef.set({
        state: 'lobby', // lobby, playing, revealing, results
        players: {
            [myPlayerId]: { name: myName, avatar: myAvatar, choice: "", score: 0 }
        }
    });

    // Clean up if host disconnects
    roomRef.onDisconnect().remove();

    document.getElementById('display-room-code').innerText = code;
    showScreen('lobby-screen');
    listenToRoom();
}

async function joinRoom() {
    vibratePhone();
    const code = document.getElementById('join-code').value.toUpperCase();
    if (!code) return alert("Please enter a room code!");

    roomRef = db.ref(`rooms/${code}`);
    const snapshot = await roomRef.once('value');
    
    if (!snapshot.exists()) {
        return alert("Room not found!");
    }

    const roomData = snapshot.val();
    if (Object.keys(roomData.players || {}).length >= 3) {
        return alert("Room is full! (Max 3 players)");
    }
    if (roomData.state !== 'lobby') {
        return alert("Game already in progress!");
    }

    currentRoom = code;
    myName = prompt("Enter your name:") || "Player " + (Object.keys(roomData.players).length + 1);
    
    await roomRef.child(`players/${myPlayerId}`).set({
        name: myName, avatar: myAvatar, choice: "", score: 0
    });

    // Remove player on disconnect
    roomRef.child(`players/${myPlayerId}`).onDisconnect().remove();

    document.getElementById('display-room-code').innerText = code;
    showScreen('lobby-screen');
    listenToRoom();
}

// --- 5. GAME SYNC LOGIC ---
function listenToRoom() {
    roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            alert("Host closed the room.");
            window.location.reload();
            return;
        }

        updateLobbyUI(data.players);

        // State Transitions
        if (data.state === 'playing' && document.getElementById('game-screen').classList.contains('hidden')) {
            showScreen('game-screen');
            resetGameUI();
        } else if (data.state === 'revealing' && document.getElementById('result-screen').classList.contains('hidden')) {
            triggerSuspenseReveal(data.players);
        } else if (data.state === 'lobby' && !document.getElementById('lobby-screen').classList.contains('hidden') === false) {
             showScreen('lobby-screen'); // for replay
        }

        // Check if everyone made a choice
        if (data.state === 'playing') {
            const players = Object.values(data.players);
            const choicesMade = players.filter(p => p.choice !== "").length;
            document.getElementById('choice-status').innerText = `${choicesMade}/${players.length} players have chosen...`;

            if (isHost && choicesMade === players.length && players.length > 1) {
                setTimeout(() => { roomRef.update({ state: 'revealing' }); }, 1000);
            }
        }
    });
}

function updateLobbyUI(playersObj) {
    const playerList = document.getElementById('player-list');
    playerList.innerHTML = "";
    
    const players = Object.values(playersObj || {});
    players.forEach(p => {
        const div = document.createElement('div');
        div.className = "flex items-center space-x-3 bg-white/10 p-3 rounded-lg backdrop-blur-sm border border-white/5";
        div.innerHTML = `<span class="text-2xl">${p.avatar}</span> <span class="font-semibold">${p.name}</span>`;
        playerList.appendChild(div);
    });

    if (isHost) {
        const startBtn = document.getElementById('start-btn');
        if (players.length >= 2) {
            startBtn.classList.remove('hidden');
            document.getElementById('waiting-msg').innerText = "Ready to start!";
        } else {
            startBtn.classList.add('hidden');
            document.getElementById('waiting-msg').innerText = "Waiting for players to join... (Max 3)";
        }
    }
}

function startGame() {
    vibratePhone();
    roomRef.update({ state: 'playing' });
}

// --- 6. GAMEPLAY ---
const messages = ["Sarika is watching your choice 👀", "Trust is fragile... 🥀", "A secret kept is a secret safe 🤫"];
let msgIndex = 0;

function typeWriterEffect() {
    const el = document.getElementById('dynamic-msg');
    gsap.to(el, { opacity: 0, duration: 0.5, onComplete: () => {
        msgIndex = (msgIndex + 1) % messages.length;
        el.innerText = messages[msgIndex];
        gsap.to(el, { opacity: 1, duration: 0.5 });
    }});
}
setInterval(typeWriterEffect, 4000);

async function makeChoice(choice) {
    vibratePhone(30);
    // Visual feedback for selected button
    document.querySelectorAll('.choice-btn').forEach(btn => btn.style.opacity = '0.5');
    event.currentTarget.style.opacity = '1';
    event.currentTarget.style.boxShadow = '0 0 20px rgba(255,255,255,0.3)';

    await roomRef.child(`players/${myPlayerId}`).update({ choice: choice });
}

function resetGameUI() {
    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.style.opacity = '1';
        btn.style.boxShadow = 'none';
    });
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('suspense-container').classList.remove('hidden');
    document.getElementById('final-results').classList.add('hidden');
}

// --- 7. RESULTS & ANIMATIONS ---
function triggerSuspenseReveal(playersObj) {
    showScreen('result-screen');
    
    // GSAP Suspense Animation
    gsap.fromTo("#suspense-container", 
        { scale: 0.8, opacity: 0 }, 
        { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.7)" }
    );

    setTimeout(() => {
        document.getElementById('suspense-container').classList.add('hidden');
        document.getElementById('final-results').classList.remove('hidden');
        
        gsap.fromTo("#final-results", 
            { y: 50, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
        );
        
        calculateAndShowResults(playersObj);
        vibratePhone([100, 50, 100]); // Victory/Reveal vibration
    }, 3000); // 3 seconds of suspense
}

function calculateAndShowResults(playersObj) {
    const players = Object.values(playersObj);
    const choices = players.map(p => p.choice);
    
    let headline = "Results Are In";
    let subtext = "Sarika is analyzing your friendship...";

    // Personalized Logic Matrix
    if (choices.includes('Betray') && choices.includes('Trust')) {
        headline = "Betrayal! 💔";
        subtext = "Did you just betray Sarika? 😏";
    } else if (choices.every(c => c === 'Trust')) {
        headline = "Pure Loyalty 🕊️";
        subtext = "Trust makes Sarika smile 💖";
    } else if (choices.every(c => c === 'Betray')) {
        headline = "A Room of Villains 😈";
        subtext = "Nobody trusted anyone. Chaos!";
    } else if (choices.includes('Secret')) {
        headline = "Mysteries 🤫";
        subtext = "Some secrets are better left untold...";
    }

    document.getElementById('result-headline').innerText = headline;
    document.getElementById('result-subtext').innerText = subtext;

    const resultsList = document.getElementById('result-players');
    resultsList.innerHTML = "";

    players.forEach(p => {
        let choiceIcon = p.choice === 'Trust' ? '🤝' : (p.choice === 'Betray' ? '😈' : '🤫');
        let colorClass = p.choice === 'Trust' ? 'text-green-400' : (p.choice === 'Betray' ? 'text-red-400' : 'text-purple-400');

        const div = document.createElement('div');
        div.className = "flex justify-between items-center bg-white/10 p-4 rounded-xl border border-white/10";
        div.innerHTML = `
            <div class="flex items-center space-x-3">
                <span class="text-2xl">${p.avatar}</span>
                <span class="font-semibold">${p.name}</span>
            </div>
            <span class="text-2xl ${colorClass} font-bold drop-shadow-md">${choiceIcon}</span>
        `;
        resultsList.appendChild(div);
    });
}

function resetGame() {
    vibratePhone();
    if (isHost) {
        // Reset choices for all players
        roomRef.child('players').once('value', snapshot => {
            const updates = {};
            snapshot.forEach(child => {
                updates[`${child.key}/choice`] = "";
            });
            roomRef.child('players').update(updates);
            roomRef.update({ state: 'lobby' });
        });
    } else {
        // Non-hosts just wait for host to change state back to lobby
        document.getElementById('result-subtext').innerText = "Waiting for host to replay...";
    }
}