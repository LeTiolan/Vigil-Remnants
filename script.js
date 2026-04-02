import * as THREE from 'three';

        // --- Maze Generation ---
        const MAZE_SIZE = 25; const TILE_SIZE = 12; 
        const maze = Array(MAZE_SIZE).fill(null).map(() => Array(MAZE_SIZE).fill(1));
        const emptyCells = [];

        function carveMaze(x, y) {
            maze[x][y] = 0;
            const dirs = [[0,-1], [0,1], [-1,0], [1,0]].sort(() => Math.random() - 0.5);
            for (let [dx, dy] of dirs) {
                const nx = x + dx * 2; const ny = y + dy * 2;
                if (nx > 0 && nx < MAZE_SIZE - 1 && ny > 0 && ny < MAZE_SIZE - 1 && maze[nx][ny] === 1) {
                    maze[x + dx][y + dy] = 0; carveMaze(nx, ny);
                }
            }
        }
        carveMaze(1, 1); 

        for (let i = 1; i < MAZE_SIZE - 1; i++) {
            for (let j = 1; j < MAZE_SIZE - 1; j++) {
                if (maze[i][j] === 1 && ((maze[i-1][j] === 0 && maze[i+1][j] === 0) || (maze[i][j-1] === 0 && maze[i][j+1] === 0)) && Math.random() < 0.25) maze[i][j] = 0; 
            }
        }

        const exitGridX = Math.floor(MAZE_SIZE / 2); const exitGridZ = MAZE_SIZE - 1; 
        for(let i = -1; i <= 1; i++) { for(let j = -3; j <= -1; j++) { maze[exitGridX + i][exitGridZ + j] = 0; } }
        maze[exitGridX][exitGridZ] = 0;

// --- Game Logic Variables ---
        const totalOrbs = 12; let orbsCollected = 0; let gameActive = false; let gameWon = false;
        let startTime = 0; let accumulatedTime = 0; let hasPlayedSting = false; let prevTime = performance.now(); 

        document.getElementById('totalOrbsUI').innerText = totalOrbs;
        let yaw = Math.PI; let pitch = 0; const SENSITIVITY = 0.002;

        const MAX_STAMINA = 200;
        const player = { height: 2.1, radius: 0.8, walkSpeed: 0.22, runSpeed: 0.48, stamina: MAX_STAMINA, isExhausted: false, velocity: new THREE.Vector2(0, 0), headBobTimer: 0 };
        const keys = {};

        const radarCanvas = document.getElementById('radar'); const rCtx = radarCanvas.getContext('2d');
        const rCenter = radarCanvas.width / 2; const radarMaxDist = 120; const radarScale = (rCenter - 10) / radarMaxDist;

        // --- Industrial Audio Engine ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let klaxonOsc, klaxonGain, vaultOsc, vaultGain, latchOsc, latchGain, pistonOsc, pistonGain, gearOsc, gearGain, hissSrc, hissGain;

        function initIndustrialAudio() {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            klaxonOsc = audioCtx.createOscillator(); klaxonOsc.type = 'triangle'; klaxonOsc.frequency.value = 450;
            const klaxonLFO = audioCtx.createOscillator(); klaxonLFO.frequency.value = 2; 
            const klaxonMod = audioCtx.createGain(); klaxonMod.gain.value = 150; 
            klaxonLFO.connect(klaxonMod); klaxonMod.connect(klaxonOsc.frequency); klaxonLFO.start();
            klaxonGain = audioCtx.createGain(); klaxonGain.gain.value = 0;
            klaxonOsc.connect(klaxonGain); klaxonGain.connect(audioCtx.destination); klaxonOsc.start();
            
            vaultOsc = audioCtx.createOscillator(); vaultOsc.type = 'sawtooth'; vaultOsc.frequency.value = 180;
            vaultGain = audioCtx.createGain(); vaultGain.gain.value = 0;
            vaultOsc.connect(vaultGain); vaultGain.connect(audioCtx.destination); vaultOsc.start();
            
            latchOsc = audioCtx.createOscillator(); latchOsc.type = 'sawtooth'; latchOsc.frequency.value = 90;
            latchGain = audioCtx.createGain(); latchGain.gain.value = 0;
            latchOsc.connect(latchGain); latchGain.connect(audioCtx.destination); latchOsc.start();
            
            pistonOsc = audioCtx.createOscillator(); pistonOsc.type = 'square'; pistonOsc.frequency.value = 35;
            pistonGain = audioCtx.createGain(); pistonGain.gain.value = 0;
            const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 150;
            pistonOsc.connect(filter); filter.connect(pistonGain); pistonGain.connect(audioCtx.destination); pistonOsc.start();
            
            gearOsc = audioCtx.createOscillator(); gearOsc.type = 'square'; gearOsc.frequency.value = 18; 
            gearGain = audioCtx.createGain(); gearGain.gain.value = 0;
            gearOsc.connect(gearGain); gearGain.connect(audioCtx.destination); gearOsc.start();
            
            const bufferSize = audioCtx.sampleRate * 2; const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = noiseBuffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
            hissSrc = audioCtx.createBufferSource(); hissSrc.buffer = noiseBuffer; hissSrc.loop = true;
            const hissFilter = audioCtx.createBiquadFilter(); hissFilter.type = 'highpass'; hissFilter.frequency.value = 1000;
            hissGain = audioCtx.createGain(); hissGain.gain.value = 0;
            hissSrc.connect(hissFilter); hissFilter.connect(hissGain); hissGain.connect(audioCtx.destination); hissSrc.start();
        }

        function playSting() {
            if (typeof audioCtx !== 'undefined') {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 1);
                gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
                osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 1);
            }
        }

        function playUISound(freq, dur, vol, type='triangle') {
            if (typeof audioCtx !== 'undefined') {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(freq/2, audioCtx.currentTime + dur);
                gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
                osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + dur);
            }
        }

        // --- Nametag typing effects & Event Shielding ---
        const nameInput = document.getElementById('name-input');
        const bgText = document.getElementById('input-bg-text');

        nameInput.addEventListener('focus', () => { 
            if (nameInput.value === "") { 
                bgText.innerHTML = '<div class="dots"><span>.</span><span>.</span><span>.</span></div>'; 
                bgText.style.opacity = "1"; 
            } 
        });

        nameInput.addEventListener('blur', () => { 
            if (nameInput.value === "") { 
                bgText.innerHTML = 'NAMETAG'; 
                bgText.style.opacity = "1"; 
            } 
        });

        nameInput.addEventListener('input', (e) => { 
            playUISound(90, 1.2, 0.25, 'triangle'); 
            e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
            if (nameInput.value !== "") {
                bgText.style.opacity = "0";
            } else {
                bgText.innerHTML = '<div class="dots"><span>.</span><span>.</span><span>.</span></div>'; 
                bgText.style.opacity = "1";
            }
        });

        // --- Procedural Textures ---
        function createGrimeTexture() {
            const c = document.createElement('canvas'); c.width = 512; c.height = 512; const ctx = c.getContext('2d');
            ctx.fillStyle = '#2a2a2a'; ctx.fillRect(0,0,512,512);
            for(let i=0; i<10000; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(80,60,40,0.1)';
                ctx.beginPath(); ctx.arc(Math.random()*512, Math.random()*512, Math.random()*4, 0, Math.PI*2); ctx.fill();
            }
            const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2); return tex;
        }

        function createHazardTexture() {
            const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d');
            ctx.fillStyle = '#d4af37'; ctx.fillRect(0,0,256,256); ctx.fillStyle = '#111';
            for(let i=-256; i<512; i+=64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i+32, 0); ctx.lineTo(i+288, 256); ctx.lineTo(i+256, 256); ctx.fill(); }
            const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
        }

// --- Scene & Lighting ---
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c121a); scene.fog = new THREE.Fog(0x0c121a, 15, 120); 
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.rotation.order = 'YXZ';

        // High quality shadows
        const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(renderer.domElement);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); scene.add(hemiLight);
        const flashLight = new THREE.SpotLight(0xffffe6, 50.0, 500, Math.PI / 5, 0.6, 1.0);
        flashLight.position.set(0, 0, 0); flashLight.castShadow = true; flashLight.shadow.bias = -0.001;
        camera.add(flashLight); camera.add(flashLight.target); flashLight.target.position.set(0, 0, -1); scene.add(camera);

        // --- Materials ---
        const matDarkMetal = new THREE.MeshStandardMaterial({ map: createGrimeTexture(), metalness: 0.8, roughness: 0.7 });
        const matRustyFrame = new THREE.MeshStandardMaterial({ color: 0x3d352b, metalness: 0.9, roughness: 0.9 });
        const matBrightSteel = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1.0, roughness: 0.2 }); 
        const matHazard = new THREE.MeshStandardMaterial({ map: createHazardTexture(), metalness: 0.3, roughness: 0.8 });
        const matWarningYellow = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.4, roughness: 0.7 });
        const matBlackHole = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1.0 });
        const matGlassRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000, transparent: true, opacity: 0.8 });
        const matIndicator = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        // --- Grid Colliders & Registration ---
        const colliders = [];
        function registerSolid(mesh) { mesh.updateMatrixWorld(); colliders.push(new THREE.Box3().setFromObject(mesh)); }

        function isWall(x, z, radius) {
            const offset = MAZE_SIZE / 2;
            const minGridX = Math.floor((x - radius + TILE_SIZE / 2) / TILE_SIZE) + offset - 1;
            const maxGridX = Math.floor((x + radius + TILE_SIZE / 2) / TILE_SIZE) + offset + 1;
            const minGridZ = Math.floor((z - radius + TILE_SIZE / 2) / TILE_SIZE) + offset - 1;
            const maxGridZ = Math.floor((z + radius + TILE_SIZE / 2) / TILE_SIZE) + offset + 1;

            for (let i = minGridX; i <= maxGridX; i++) {
                for (let j = minGridZ; j <= maxGridZ; j++) {
                    if (i >= 0 && i < MAZE_SIZE && j >= 0 && j < MAZE_SIZE && maze[i][j] === 1) {
                        const wallCenterX = (i - offset) * TILE_SIZE;
                        const wallCenterZ = (j - offset) * TILE_SIZE;
                        const closestX = Math.max(wallCenterX - TILE_SIZE / 2, Math.min(x, wallCenterX + TILE_SIZE / 2));
                        const closestZ = Math.max(wallCenterZ - TILE_SIZE / 2, Math.min(z, wallCenterZ + TILE_SIZE / 2));
                        const dx = x - closestX; const dz = z - closestZ;
                        if ((dx * dx + dz * dz) < (radius * radius)) return true;
                    }
                }
            }
            const pBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, player.height/2, z), new THREE.Vector3(radius*2, player.height, radius*2));
            for (let c of colliders) if (pBox.intersectsBox(c)) return true;
            return false;
        }

        // --- Particle Systems ---
        const dustGeo = new THREE.BufferGeometry(); const dustCount = 1500;
        const dustPos = new Float32Array(dustCount * 3);
        for(let i=0; i<dustCount*3; i++) { dustPos[i] = (Math.random() - 0.5) * MAZE_SIZE * TILE_SIZE; }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        const dustMat = new THREE.PointsMaterial({ color: 0x8b6b4a, size: 0.2, transparent: true, opacity: 0.5 });
        const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

        // --- Level Building ---
        const floorGeo = new THREE.PlaneGeometry(MAZE_SIZE * TILE_SIZE, MAZE_SIZE * TILE_SIZE);
        const floor = new THREE.Mesh(floorGeo, matDarkMetal); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        const ceiling = new THREE.Mesh(floorGeo, matRustyFrame); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 12; ceiling.receiveShadow = true; scene.add(ceiling);

        const wallGeo = new THREE.BoxGeometry(TILE_SIZE, 12, TILE_SIZE);
        const pillarGeo = new THREE.CylinderGeometry(1, 1, 12, 8);

        for (let i = 0; i < MAZE_SIZE; i++) {
            for (let j = 0; j < MAZE_SIZE; j++) {
                if (maze[i][j] === 1) {
                    const isEdge = i === 0 || j === 0 || i === MAZE_SIZE - 1 || j === MAZE_SIZE - 1;
                    const wall = new THREE.Mesh(wallGeo, isEdge ? matHazard : matRustyFrame);
                    wall.position.set((i - MAZE_SIZE/2) * TILE_SIZE, 6, (j - MAZE_SIZE/2) * TILE_SIZE);
                    wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
                    if (!isEdge && Math.random() > 0.8) {
                        const pillar = new THREE.Mesh(pillarGeo, matWarningYellow);
                        pillar.position.set(wall.position.x + (Math.random()-0.5)*TILE_SIZE, 6, wall.position.z + (Math.random()-0.5)*TILE_SIZE);
                        pillar.castShadow = true; pillar.receiveShadow = true; scene.add(pillar); registerSolid(pillar);
                    }
                }
            }
        }

        // --- Dynamic Vault Door ---
        const doorGroup = new THREE.Group();
        doorGroup.position.set((exitGridX - MAZE_SIZE/2) * TILE_SIZE, 0, (exitGridZ - MAZE_SIZE/2) * TILE_SIZE);
        
        const frame = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 2), matDarkMetal);
        frame.position.set(0, 6, 0); frame.castShadow = true; doorGroup.add(frame); registerSolid(frame);

        const vaultHole = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 2.2), matBlackHole);
        vaultHole.position.set(0, 4, 0); doorGroup.add(vaultHole);

        const mainLight = new THREE.PointLight(0xff0000, 10, 30); mainLight.position.set(0, 9, -2); doorGroup.add(mainLight);
        const sirenLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1, 8), matGlassRed);
        sirenLeft.position.set(-4, 11, -1); doorGroup.add(sirenLeft);
        const sirenRight = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1, 8), matGlassRed);
        sirenRight.position.set(4, 11, -1); doorGroup.add(sirenRight);

        function createGearMesh(radius, depth, teethCount) {
            const gearGroup = new THREE.Group();
            const core = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 16), matBrightSteel);
            core.rotation.x = Math.PI / 2; core.castShadow = true; gearGroup.add(core);
            const toothGeo = new THREE.BoxGeometry(radius * 0.4, radius * 0.4, depth);
            for(let i=0; i<teethCount; i++) {
                const angle = (i / teethCount) * Math.PI * 2;
                const tooth = new THREE.Mesh(toothGeo, matBrightSteel);
                tooth.position.set(Math.cos(angle) * radius * 0.95, Math.sin(angle) * radius * 0.95, 0);
                tooth.rotation.z = angle + Math.PI/2; tooth.castShadow = true; gearGroup.add(tooth);
            }
            const axle = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, depth + 0.2, 12), matDarkMetal);
            axle.rotation.x = Math.PI / 2; gearGroup.add(axle); return gearGroup;
        }

        const gearRadius = 1.8;
        const gearLeft = createGearMesh(gearRadius, 0.8, 8); gearLeft.position.set(-3, 11 + gearRadius, -1.2); doorGroup.add(gearLeft);
        const gearRight = createGearMesh(gearRadius, 0.8, 8); gearRight.position.set(3, 11 + gearRadius, -1.2); doorGroup.add(gearRight);
        
        const helperGearRadius = 0.9;
        const helperGearLeft = createGearMesh(helperGearRadius, 0.6, 6); helperGearLeft.position.set(-3 - gearRadius - helperGearRadius + 0.2, 11 + gearRadius + 1, -0.8); doorGroup.add(helperGearLeft);
        const helperGearRight = createGearMesh(helperGearRadius, 0.6, 6); helperGearRight.position.set(3 + gearRadius + helperGearRadius - 0.2, 11 + gearRadius + 1, -0.8); doorGroup.add(helperGearRight);

        const pistonGroup = new THREE.Group(); doorGroup.add(pistonGroup);
        const pistonGeo = new THREE.BoxGeometry(1.5, 6, 1.5);
        const pistonL = new THREE.Mesh(pistonGeo, matHazard); pistonL.position.set(-3.5, 7, -0.8); pistonL.castShadow = true; pistonGroup.add(pistonL); registerSolid(pistonL);
        const pistonR = new THREE.Mesh(pistonGeo, matHazard); pistonR.position.set(3.5, 7, -0.8); pistonR.castShadow = true; pistonGroup.add(pistonR); registerSolid(pistonR);

        scene.add(doorGroup);

// --- Orb Spawning ---
        const orbs = [];
        const orbGeo = new THREE.SphereGeometry(0.5, 16, 16);
        const orbMat = new THREE.MeshStandardMaterial({ color: 0x00eeff, emissive: 0x0088aa, metalness: 0.1, roughness: 0.2 });

        for (let i = 0; i < MAZE_SIZE; i++) {
            for (let j = 0; j < MAZE_SIZE; j++) {
                if (maze[i][j] === 0) emptyCells.push({x: i, z: j});
            }
        }

        for (let i = 0; i < totalOrbs; i++) {
            if (emptyCells.length === 0) break;
            const idx = Math.floor(Math.random() * emptyCells.length);
            const cell = emptyCells.splice(idx, 1)[0];
            const orb = new THREE.Mesh(orbGeo, orbMat);
            orb.position.set((cell.x - MAZE_SIZE/2) * TILE_SIZE, 3, (cell.z - MAZE_SIZE/2) * TILE_SIZE);
            const orbLight = new THREE.PointLight(0x00eeff, 1, 15);
            orbLight.position.copy(orb.position);
            scene.add(orb); scene.add(orbLight);
            orbs.push({ mesh: orb, light: orbLight, active: true, floatOffset: Math.random() * Math.PI * 2 });
        }

        // --- Enemy Logic ---
        const enemies = [];
        const SAFE_ZONE_FROM_PLAYER = 20;
        const phantomGeo = new THREE.CylinderGeometry(0.8, 0.2, 3.5, 16);
        const phantomMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, transparent: true, opacity: 0.8 });

        function spawnEnemy() {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 100) {
                const i = Math.floor(Math.random() * MAZE_SIZE);
                const j = Math.floor(Math.random() * MAZE_SIZE);
                if (maze[i][j] === 0) {
                    const ex = (i - MAZE_SIZE/2) * TILE_SIZE;
                    const ez = (j - MAZE_SIZE/2) * TILE_SIZE;
                    
                    // Enforce safe zone away from player spawn (0,0)
                    const distToPlayer = Math.sqrt(ex*ex + ez*ez); 
                    if (distToPlayer > SAFE_ZONE_FROM_PLAYER) {
                        const phantom = new THREE.Mesh(phantomGeo, phantomMat);
                        phantom.position.set(ex, 3, ez);
                        scene.add(phantom);
                        const pLight = new THREE.PointLight(0xff0000, 2, 25);
                        pLight.position.copy(phantom.position);
                        scene.add(pLight);
                        enemies.push({ mesh: phantom, light: pLight, speed: 0.08, active: false });
                        placed = true;
                    }
                }
                attempts++;
            }
        }
        
        // Initialize two roaming phantoms
        spawnEnemy();
        spawnEnemy();

        // --- Player Controls ---
        document.addEventListener('keydown', (e) => { 
            keys[e.code] = true; 
            if (e.code === 'ShiftLeft' && !player.isExhausted) player.run = true;
        });
        document.addEventListener('keyup', (e) => { 
            keys[e.code] = false; 
            if (e.code === 'ShiftLeft') player.run = false;
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body) {
                yaw -= e.movementX * SENSITIVITY;
                pitch -= e.movementY * SENSITIVITY;
                pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, pitch));
                camera.rotation.set(pitch, yaw, 0);
            }
        });

        document.getElementById('engage-btn').addEventListener('click', () => {
            document.body.requestPointerLock();
            initIndustrialAudio();
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                document.getElementById('main-ui').style.display = 'none';
                if (!gameActive && !gameWon) {
                    gameActive = true;
                    startTime = performance.now() - accumulatedTime;
                    prevTime = performance.now();
                    enemies.forEach(e => e.active = true); // Enemies begin hunting
                }
            } else {
                if (gameActive && !gameWon) {
                    document.getElementById('main-ui').style.display = 'flex';
                    gameActive = false;
                }
            }
        });

// --- Main Game Loop ---
        function update() {
            if (!gameActive) return;
            
            const now = performance.now();
            const dt = (now - prevTime) / 1000;
            prevTime = now;

            accumulatedTime += dt;
            const totalElapsed = (accumulatedTime).toFixed(1);
            document.getElementById('timeVal').innerText = totalElapsed;

            // Player movement & Stamina
            let speed = player.walkSpeed;
            if (player.run && player.stamina > 0 && !player.isExhausted) {
                speed = player.runSpeed;
                player.stamina -= dt * 60;
                if (player.stamina <= 0) player.isExhausted = true;
            } else {
                player.stamina += dt * 30;
                if (player.stamina > MAX_STAMINA) {
                    player.stamina = MAX_STAMINA;
                    player.isExhausted = false;
                }
            }
            
            document.getElementById('stamina-bar').style.width = (player.stamina / MAX_STAMINA) * 100 + '%';
            document.getElementById('stamina-bar').style.background = player.isExhausted ? 'linear-gradient(to bottom, #aa3333, #660000)' : 'linear-gradient(to bottom, #d4af37, #997a00)';

            const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            
            let targetVelocityX = 0;
            let targetVelocityZ = 0;

            if (keys['KeyW']) { targetVelocityX += forward.x; targetVelocityZ += forward.z; }
            if (keys['KeyS']) { targetVelocityX -= forward.x; targetVelocityZ -= forward.z; }
            if (keys['KeyA']) { targetVelocityX -= right.x; targetVelocityZ -= right.z; }
            if (keys['KeyD']) { targetVelocityX += right.x; targetVelocityZ += right.z; }
            
            const length = Math.sqrt(targetVelocityX * targetVelocityX + targetVelocityZ * targetVelocityZ);
            if (length > 0) {
                targetVelocityX = (targetVelocityX / length) * speed;
                targetVelocityZ = (targetVelocityZ / length) * speed;
            }

            // Smooth velocity lerping
            player.velocity.x += (targetVelocityX - player.velocity.x) * 10 * dt;
            player.velocity.y += (targetVelocityZ - player.velocity.y) * 10 * dt;

            if (Math.abs(player.velocity.x) > 0.001 || Math.abs(player.velocity.y) > 0.001) {
                const nextX = camera.position.x + player.velocity.x * dt * 60;
                if (!isWall(nextX, camera.position.z, player.radius)) camera.position.x = nextX;
                
                const nextZ = camera.position.z + player.velocity.y * dt * 60;
                if (!isWall(camera.position.x, nextZ, player.radius)) camera.position.z = nextZ;
                
                player.headBobTimer += dt * (speed === player.runSpeed ? 15 : 10);
                camera.position.y = 6 + Math.sin(player.headBobTimer) * 0.15;
                
                if (gearGain && gearGain.gain.value < 0.3) gearGain.gain.value += 0.05;
                if (pistonGain && pistonGain.gain.value < 0.2) pistonGain.gain.value += 0.02;
            } else {
                if (gearGain && gearGain.gain.value > 0) gearGain.gain.value -= 0.05;
                if (pistonGain && pistonGain.gain.value > 0) pistonGain.gain.value -= 0.02;
                camera.position.y += (6 - camera.position.y) * 0.1;
            }

            // Enemies Logic
            let closestDist = Infinity;
            for (let e of enemies) {
                if (e.active) {
                    const dirToPlayer = new THREE.Vector3().subVectors(camera.position, e.mesh.position);
                    dirToPlayer.y = 0;
                    const dist = dirToPlayer.length();
                    if (dist < closestDist) closestDist = dist;
                    
                    if (dist > 0) {
                        dirToPlayer.normalize();
                        e.mesh.position.addScaledVector(dirToPlayer, e.speed * dt * 60);
                        e.light.position.copy(e.mesh.position);
                    }
                    
                    // Death condition
                    if (dist < 2.0) {
                        gameActive = false;
                        document.exitPointerLock();
                        document.getElementById('death-screen-ui').style.display = 'block';
                        document.getElementById('time-stat').innerText = totalElapsed + 's';
                        document.getElementById('orb-stat').innerText = orbsCollected + ' / ' + totalOrbs;
                        
                        if(klaxonOsc) klaxonOsc.stop(); if(latchOsc) latchOsc.stop(); 
                        if(pistonOsc) pistonOsc.stop(); if(gearOsc) gearOsc.stop(); 
                        if(vaultOsc) vaultOsc.stop(); if(hissSrc) hissSrc.stop();
                    }
                }
            }

            if (closestDist !== Infinity) {
                const vol = Math.max(0, 1 - (closestDist / 40));
                if (vaultGain) vaultGain.gain.value = vol * 0.4;
                if (klaxonGain) klaxonGain.gain.value = vol * 0.1;
            }

            // Orb collection
            for (let orb of orbs) {
                if (orb.active) {
                    orb.mesh.position.y = 3 + Math.sin(now * 0.002 + orb.floatOffset) * 0.5;
                    if (camera.position.distanceTo(orb.mesh.position) < 3) {
                        orb.active = false;
                        scene.remove(orb.mesh);
                        scene.remove(orb.light);
                        orbsCollected++;
                        document.getElementById('orbCount').innerText = orbsCollected;
                        if(latchGain) { latchGain.gain.value = 0.5; setTimeout(() => latchGain.gain.value = 0, 100); }
                    }
                }
            }

            // Breach logic & Vault Animations
            const breachPos = new THREE.Vector3((exitGridX - MAZE_SIZE/2) * TILE_SIZE, 0, (exitGridZ - MAZE_SIZE/2) * TILE_SIZE);
            if (orbsCollected === totalOrbs) {
                if (!hasPlayedSting) {
                    hasPlayedSting = true;
                    playSting();
                }
                
                gearLeft.rotation.z -= dt * 2;
                gearRight.rotation.z += dt * 2;
                helperGearLeft.rotation.z += dt * 3;
                helperGearRight.rotation.z -= dt * 3;
                
                pistonL.position.y = 7 + Math.sin(now * 0.005) * 1.5;
                pistonR.position.y = 7 + Math.sin(now * 0.005) * 1.5;
            }

            // Radar update
            rCtx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);
            rCtx.fillStyle = 'rgba(0, 238, 255, 0.2)';
            rCtx.beginPath(); rCtx.arc(rCenter, rCenter, rCenter, 0, Math.PI * 2); rCtx.fill();
            
            rCtx.strokeStyle = 'rgba(0, 238, 255, 0.4)';
            rCtx.beginPath(); rCtx.moveTo(rCenter, 0); rCtx.lineTo(rCenter, radarCanvas.height); rCtx.stroke();
            rCtx.beginPath(); rCtx.moveTo(0, rCenter); rCtx.lineTo(radarCanvas.width, rCenter); rCtx.stroke();
            
            // Draw player center
            rCtx.fillStyle = '#fff';
            rCtx.beginPath(); rCtx.arc(rCenter, rCenter, 3, 0, Math.PI*2); rCtx.fill();

            function drawOnRadar(pos, color, size, isVault = false) {
                const dx = pos.x - camera.position.x;
                const dz = pos.z - camera.position.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist < radarMaxDist) {
                    const angle = Math.atan2(dz, dx) - yaw + Math.PI/2;
                    const rx = rCenter + Math.cos(angle) * dist * radarScale;
                    const ry = rCenter + Math.sin(angle) * dist * radarScale;
                    
                    rCtx.fillStyle = color;
                    if (isVault) {
                        rCtx.fillRect(rx - size, ry - size, size * 2, size * 2);
                        rCtx.strokeStyle = '#000';
                        rCtx.strokeRect(rx - size, ry - size, size * 2, size * 2);
                    } else {
                        rCtx.beginPath(); rCtx.arc(rx, ry, size, 0, Math.PI*2); rCtx.fill();
                    }
                }
            }

            for (let orb of orbs) if (orb.active) drawOnRadar(orb.mesh.position, '#00eeff', 3);
            for (let e of enemies) if (e.active) drawOnRadar(e.mesh.position, '#ff0000', 4);
            if (orbsCollected === totalOrbs) drawOnRadar(breachPos, '#77ff77', 6, true);

            // Dust animation
            const positions = dustGeo.attributes.position.array;
            for(let i=1; i<dustCount*3; i+=3) {
                positions[i] -= dt * 2;
                if(positions[i] < 0) positions[i] = 12;
            }
            dustGeo.attributes.position.needsUpdate = true;

            // Win condition
            if (orbsCollected === totalOrbs && camera.position.distanceTo(breachPos) < 4) {
                gameActive = false;
                gameWon = true;
                document.exitPointerLock();
                
                // Fade out screen and fade in text simultaneously
                const winScreen = document.getElementById('win-screen');
                const fadeBlack = document.getElementById('fade-black');
                
                winScreen.style.display = 'flex';
                // Small delay to ensure display:flex is registered before fading
                setTimeout(() => {
                    fadeBlack.style.opacity = '1';
                    winScreen.style.opacity = '1';
                }, 50);

                document.getElementById('finalTime').innerText = `FINAL TIME: ${totalElapsed}s`;
                if(klaxonOsc) klaxonOsc.stop(); if(latchOsc) latchOsc.stop(); if(pistonOsc) pistonOsc.stop(); if(gearOsc) gearOsc.stop(); if(vaultOsc) vaultOsc.stop(); if(hissSrc) hissSrc.stop();
            }
        }

        function animate() { requestAnimationFrame(animate); update(); renderer.render(scene, camera); } animate();
        window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
        
        // Reboot Button Logic
        document.getElementById('reboot-btn').addEventListener('click', () => {
            const deathUI = document.getElementById('death-screen-ui');
            deathUI.style.transition = 'opacity 0.5s';
            deathUI.style.opacity = '0';
            setTimeout(() => { location.reload(); }, 500);
        });
