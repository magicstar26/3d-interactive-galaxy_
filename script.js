import * as THREE from 'three';
import { FilesetResolver, HandLandmarker, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

let scene, camera, renderer, particles;
let handLandmarker, drawingUtils;
const particleCount = 25000; 
let targetPositions = new Float32Array(particleCount * 3);
let handPos = new THREE.Vector3(0, 0, 0);
let lastShape = "";

const video = document.getElementById('webcam');
const canvasElement = document.getElementById('hand-canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('gesture-status');

// --- GENERATOR BENTUK (DEKAT & PADAT) ---
function getPoints(shape) {
    const pts = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        let x, y, z;
        const t = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const idx = i * 3;

        // Ukuran bentuk diperkecil agar terlihat lebih "dekat" dan padat
        if (shape === 'heart') {
            const a = Math.random() * Math.PI * 2;
            x = 12 * Math.pow(Math.sin(a), 3) * 0.5;
            y = (13 * Math.cos(a) - 5 * Math.cos(2*a) - 2 * Math.cos(3*a) - Math.cos(4*a)) * 0.5;
            z = (Math.random() - 0.5) * 2;
        } else if (shape === 'love_sign') {
            const a = Math.random() * Math.PI * 2;
            x = 6 * Math.pow(Math.sin(a), 3) * 0.4;
            y = (13 * Math.cos(a) - 5 * Math.cos(2*a) - 2 * Math.cos(3*a) - Math.cos(4*a)) * 0.4 + 5;
            z = (Math.random() - 0.5) * 1;
        } else if (shape === 'saturn') {
            if (i < particleCount * 0.4) {
                const r = 5;
                x = r * Math.sqrt(1 - u * u) * Math.cos(t);
                y = r * Math.sqrt(1 - u * u) * Math.sin(t);
                z = r * u;
            } else {
                const r = 8 + Math.random() * 4;
                x = r * Math.cos(t);
                y = (Math.random() - 0.5) * 0.3;
                z = r * Math.sin(t);
            }
        } else {
            const r = 10;
            x = r * Math.sqrt(1 - u * u) * Math.cos(t);
            y = r * Math.sqrt(1 - u * u) * Math.sin(t);
            z = r * u;
        }
        pts[idx] = x; pts[idx+1] = y; pts[idx+2] = z;
    }
    return pts;
}

async function init() {
    scene = new THREE.Scene();
    // Camera didekatkan (Z: 35) agar partikel terasa di depan mata
    camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.z = 35;

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas3d'), antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x050505);

    const geo = new THREE.BufferGeometry();
    targetPositions = getPoints('sphere');
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));

    const mat = new THREE.PointsMaterial({
        size: 0.12, color: 0x00ffcc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });

    particles = new THREE.Points(geo, mat);
    scene.add(particles);

    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` },
        runningMode: "VIDEO", numHands: 1
    });
    drawingUtils = new DrawingUtils(canvasCtx);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.onloadeddata = () => {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        animate();
    };

    document.getElementById('particleColor').addEventListener('input', (e) => mat.color.set(e.target.value));
}

function animate() {
    requestAnimationFrame(animate);
    const p = particles.geometry.attributes.position.array;

    for (let i = 0; i < p.length; i += 3) {
        // Efek Magnet & Arus (Ditingkatkan kecepatannya)
        const dx = handPos.x - p[i];
        const dy = handPos.y - p[i+1];
        const dist = Math.sqrt(dx*dx + dy*dy);
        const force = Math.max(0, (25 - dist) * 0.02); // Power magnet lebih kencang

        p[i] += (targetPositions[i] - p[i]) * 0.18 + (dx * force);
        p[i+1] += (targetPositions[i+1] - p[i+1]) * 0.18 + (dy * force);
        p[i+2] += (targetPositions[i+2] - p[i+2]) * 0.18;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    if (video.readyState === 4) {
        const results = handLandmarker.detectForVideo(video, performance.now());
        canvasCtx.clearRect(0,0, canvasElement.width, canvasElement.height);
        
        if (results.landmarks && results.landmarks.length > 0) {
            const hand = results.landmarks[0];
            drawingUtils.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: "#00FFCC", lineWidth: 2 });

            // --- FITUR PUTAR-PUTAR (Rotasi berdasarkan kemiringan tangan) ---
            // Menggunakan koordinat pergelangan tangan (0) dan jari tengah (9)
            const rotationY = (hand[9].x - 0.5) * Math.PI;
            const rotationX = (hand[9].y - 0.5) * Math.PI;
            particles.rotation.y = THREE.MathUtils.lerp(particles.rotation.y, rotationY, 0.1);
            particles.rotation.x = THREE.MathUtils.lerp(particles.rotation.x, rotationX, 0.1);

            // --- ZOOM BERDASARKAN JARAK ---
            const s = Math.hypot(hand[5].x - hand[17].x, hand[5].y - hand[17].y);
            const scale = Math.max(0.3, s * 10);
            particles.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.2);

            // --- POSISI TANGAN (FOLLOW) ---
            handPos.x = (hand[9].x - 0.5) * -60;
            handPos.y = (hand[9].y - 0.5) * -45;

            // --- GESTURE CHECK ---
            const thumbTip = hand[4];
            const indexTip = hand[8];
            const distLove = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
            const isLove = distLove < 0.04 && hand[12].y > hand[10].y;

            const fingers = [8, 12, 16, 20].filter(idx => hand[idx].y < hand[idx-2].y).length;
            
            let shape = isLove ? "love_sign" : (fingers === 0 ? 'heart' : (fingers === 3 ? 'saturn' : (fingers >= 4 ? 'flower' : 'sphere')));
            
            if (shape !== lastShape) {
                targetPositions = getPoints(shape);
                lastShape = shape;
            }
            statusText.innerText = `Mode: ${shape.toUpperCase()}`;
        }
    }
    renderer.render(scene, camera);
}

init();
