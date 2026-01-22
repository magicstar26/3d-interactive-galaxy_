import * as THREE from 'three';
import { FilesetResolver, HandLandmarker, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

let scene, camera, renderer, particles;
let handLandmarker, drawingUtils;
const particleCount = 50000; 
let targetPositions = new Float32Array(particleCount * 3);
let handPos = new THREE.Vector3(0, 0, 0);
let lastShape = "";

const video = document.getElementById('webcam');
const canvasElement = document.getElementById('hand-canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('gesture-status');

// --- GENERATOR BENTUK ---
function getPoints(shape) {
    const pts = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        let x, y, z;
        const t = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const idx = i * 3;

        if (shape === 'heart') {
            const a = Math.random() * Math.PI * 2;
            x = 16 * Math.pow(Math.sin(a), 3) * 0.7;
            y = (13 * Math.cos(a) - 5 * Math.cos(2*a) - 2 * Math.cos(3*a) - Math.cos(4*a)) * 0.7;
            z = (Math.random() - 0.5) * 2;
        } else if (shape === 'love_sign') {
            // Bentuk Mini Heart (🤞🏻 Finger Heart)
            const a = Math.random() * Math.PI * 2;
            x = 8 * Math.pow(Math.sin(a), 3) * 0.4;
            y = (13 * Math.cos(a) - 5 * Math.cos(2*a) - 2 * Math.cos(3*a) - Math.cos(4*a)) * 0.4 + 10;
            z = (Math.random() - 0.5) * 1;
        } else if (shape === 'saturn') {
            if (i < particleCount * 0.4) {
                const r = 7;
                x = r * Math.sqrt(1 - u * u) * Math.cos(t);
                y = r * Math.sqrt(1 - u * u) * Math.sin(t);
                z = r * u;
            } else {
                const r = 11 + Math.random() * 6;
                x = r * Math.cos(t);
                y = (Math.random() - 0.5) * 0.4;
                z = r * Math.sin(t);
                const tz = z * Math.cos(0.6) - y * Math.sin(0.6);
                const ty = z * Math.sin(0.6) + y * Math.cos(0.6);
                y = ty; z = tz;
            }
        } else if (shape === 'flower') {
            const r = 10 * Math.cos(5 * t);
            x = r * Math.cos(t);
            y = r * Math.sin(t);
            z = u * 3;
        } else {
            const r = 15;
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
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas3d'), antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x050505);

    const geo = new THREE.BufferGeometry();
    targetPositions = getPoints('sphere');
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));

    const mat = new THREE.PointsMaterial({
        size: 0.1, color: 0x00ffcc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
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
        const dx = handPos.x - p[i];
        const dy = handPos.y - p[i+1];
        const dist = Math.sqrt(dx*dx + dy*dy);
        const force = Math.max(0, (30 - dist) * 0.015); 

        p[i] += (targetPositions[i] - p[i]) * 0.15 + (dx * force);
        p[i+1] += (targetPositions[i+1] - p[i+1]) * 0.15 + (dy * force);
        p[i+2] += (targetPositions[i+2] - p[i+2]) * 0.15;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    if (video.readyState === 4) {
        const results = handLandmarker.detectForVideo(video, performance.now());
        canvasCtx.clearRect(0,0, canvasElement.width, canvasElement.height);
        
        if (results.landmarks && results.landmarks.length > 0) {
            const hand = results.landmarks[0];
            drawingUtils.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: "#00FFCC", lineWidth: 3 });

            // LOGIKA GESTURE LOVE SIGN (🤞🏻)
            const thumbTip = hand[4];
            const indexTip = hand[8];
            const distLove = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
            const isLove = distLove < 0.04 && hand[12].y > hand[10].y; // Jempol telunjuk nempel, jari lain tekuk

            // Scaler (Distance)
            const s = Math.hypot(hand[5].x - hand[17].x, hand[5].y - hand[17].y);
            const scale = Math.max(0.2, s * 8);
            particles.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.2);

            // X-Y Follow
            handPos.x = (hand[9].x - 0.5) * -80;
            handPos.y = (hand[9].y - 0.5) * -60;

            const fingers = [8, 12, 16, 20].filter(idx => hand[idx].y < hand[idx-2].y).length;
            
            let shape = "sphere";
            if (isLove) shape = "love_sign";
            else if (fingers === 0) shape = 'heart'; 
            else if (fingers === 3) shape = 'saturn'; 
            else if (fingers >= 4) shape = 'flower';
            
            if (shape !== lastShape) {
                targetPositions = getPoints(shape);
                lastShape = shape;
            }
            statusText.innerText = `Bentuk: ${shape.toUpperCase()}`;
        }
    }
    renderer.render(scene, camera);
}

init();