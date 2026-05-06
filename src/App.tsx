import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Gauge, Compass, RotateCw, Flag, CircleParking } from 'lucide-react';

  // --- Constants ---
const WORLD_SIZE = 5000;
const FRICTION = 0.98;
const ACCEL = 0.55; 
const STEER = 0.05;
const DRIFT_FACTOR = 0.85; 
const TRACK_POINTS = 16;
const TRACK_WIDTH = 300; 
const SPEED_UNIT = 15; 

type Biome = 'plains' | 'winter' | 'sand' | 'muddy';

type VehicleType = 'coupe' | 'truck' | 'semi' | 'motorcycle' | 'cyber';

interface VehicleConfig {
  name: string;
  width: number;
  length: number;
  layers: number;
  accelMult: number;
  speedMult: number;
  steerMult: number;
  hasTrailer?: boolean;
}

const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
  coupe: { name: 'Drift Coupe', width: 24, length: 36, layers: 12, accelMult: 1.1, speedMult: 1.1, steerMult: 1.1 },
  truck: { name: '4x4 Truck', width: 28, length: 60, layers: 14, accelMult: 0.9, speedMult: 0.95, steerMult: 0.9 },
  semi: { name: 'Giga Hauler', width: 32, length: 50, layers: 16, accelMult: 0.6, speedMult: 0.75, steerMult: 0.7, hasTrailer: true },
  motorcycle: { name: 'Neon Cycle', width: 10, length: 32, layers: 10, accelMult: 1.6, speedMult: 1.3, steerMult: 1.6 },
  cyber: { name: 'Cyber Drift', width: 26, length: 42, layers: 18, accelMult: 1.4, speedMult: 1.5, steerMult: 1.3 },
};

const VEHICLE_COLORS = ['#39FF14', '#FF007F', '#00E5FF', '#FFEA00', '#FF6321', '#FFFFFF', '#1a1a1a'];

interface AIState {
  x: number;
  y: number;
  angle: number;
  v: number;
  vx: number;
  vy: number;
  targetIdx: number;
  laps: number;
  type: VehicleType;
  color?: string;
  state?: 'roaming' | 'avoiding' | 'maneuvering' | 'searching' | 'parked';
  avoidAngle?: number;
  trailer?: { x: number; y: number; angle: number; vx: number; vy: number };
  // Advanced AI properties
  racingLineOffset?: number;
  brakingZone?: boolean;
  targetSpot?: any;
  maneuverStep?: number;
  maneuverTimer?: number;
  stopTime?: number;
}

interface BiomeSettings {
  ground: string;
  grid: string;
  obstacleColors: { tree: string; rock: string; cone: string; pothole?: string };
  carColor: string;
  aiColor: string;
  name: string;
  friction: number;
  traction: number;
  offRoadPenalty: number;
  maxSpeedKmh: number;
}

const BIOMES: Record<Biome, BiomeSettings> = {
  plains: {
    ground: '#2D5A27',
    grid: '#1e3a1a',
    obstacleColors: { tree: '#1b3d17', rock: '#475569', cone: '#FFEA00' },
    carColor: '#39FF14',
    aiColor: '#FF007F',
    name: 'Green Plains',
    friction: 0.98,
    traction: 1,
    offRoadPenalty: 0.7,
    maxSpeedKmh: 120
  },
  winter: {
    ground: '#eef2ff',
    grid: '#c7d2fe',
    obstacleColors: { tree: '#064e3b', rock: '#94a3b8', cone: '#f43f5e' },
    carColor: '#f43f5e',
    aiColor: '#3b82f6',
    name: 'Frozen Tundra',
    friction: 0.995,
    traction: 0.4,
    offRoadPenalty: 0.8,
    maxSpeedKmh: 120
  },
  sand: {
    ground: '#fde047',
    grid: '#eab308',
    obstacleColors: { tree: '#166534', rock: '#a16207', cone: '#ef4444' },
    carColor: '#00E5FF',
    aiColor: '#d946ef',
    name: 'Sun Desert',
    friction: 0.96,
    traction: 0.8,
    offRoadPenalty: 0.5,
    maxSpeedKmh: 120
  },
  muddy: {
    ground: '#451a03',
    grid: '#713f12',
    obstacleColors: { tree: '#064e3b', rock: '#1a0a02', cone: '#00E5FF', pothole: '#2a1001' },
    carColor: '#FFD700',
    aiColor: '#39FF14',
    name: 'Muddy Swamp',
    friction: 0.94,
    traction: 0.6,
    offRoadPenalty: 0.6,
    maxSpeedKmh: 120
  }
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  text?: string;
}

interface Obstacle {
  x: number;
  y: number;
  type: 'tree' | 'rock' | 'cone' | 'pothole' | 'road';
  size: number;
  vType?: VehicleType;
  color?: string;
  angle?: number;
}

interface CarState {
  x: number;
  y: number;
  angle: number;
  v: number;
  vx: number;
  vy: number;
  laps: number;
  lastCheck: number;
  trailer?: { x: number; y: number; angle: number; vx: number; vy: number };
}

type GamePhase = 'menu' | 'difficulty' | 'countdown' | 'race' | 'crash';
type GameMode = 'free' | 'race' | 'parking' | 'horizon';
type Difficulty = 'easy' | 'normal' | 'hard' | 'impossible';
type MenuState = 'main' | 'race_biome' | 'race_diff' | 'free_biome' | 'free_type' | 'free_sandbox_settings' | 'horizon_select';

const DIFFICULTY_CONFIG: Record<Difficulty, { turnSpeed: number; speedLimit: number; color: string }> = {
  easy: { turnSpeed: 0.05, speedLimit: 0.70, color: '#39FF14' },
  normal: { turnSpeed: 0.12, speedLimit: 0.85, color: '#00E5FF' },
  hard: { turnSpeed: 0.18, speedLimit: 1.0, color: '#FFEA00' },
  impossible: { turnSpeed: 0.35, speedLimit: 1.15, color: '#FF007F' }
};

// --- Sound Engine ---
const createAudio = () => {
    try {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AudioContextClass) return null;
        const ctx = new AudioContextClass();
        const master = ctx.createGain();
        master.connect(ctx.destination);
        master.gain.value = 0.15;

        // Better Engine Sound
        const engineOsc1 = ctx.createOscillator();
        const engineOsc2 = ctx.createOscillator();
        
        // Noise for grit
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < ctx.sampleRate; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;

        const engineGain = ctx.createGain();
        const noiseGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        engineOsc1.type = 'sawtooth';
        engineOsc2.type = 'square';
        
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        
        engineOsc1.connect(filter);
        engineOsc2.connect(filter);
        noiseNode.connect(noiseGain);
        noiseGain.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        
        engineGain.gain.value = 0;
        
        engineOsc1.start();
        engineOsc2.start();
        noiseNode.start();

        // Background Music Loop
        let musicActive = true;
        let isMusicPlaying = false;
        const playMusic = () => {
            if (isMusicPlaying) return;
            isMusicPlaying = true;
            const notes = [220, 261.63, 293.66, 329.63, 392.00, 440]; // A minor pentatonic
            let noteIdx = 0;
            
            const scheduleNote = () => {
                if (!musicActive) {
                    isMusicPlaying = false;
                    return;
                }
                
                const synthOsc = ctx.createOscillator();
                const synthGain = ctx.createGain();
                synthOsc.type = 'square';
                
                const octave = Math.random() > 0.8 ? 1 : 0.5;
                synthOsc.frequency.value = notes[noteIdx] * octave;
                
                const synthFilter = ctx.createBiquadFilter();
                synthFilter.type = 'lowpass';
                synthFilter.frequency.value = Math.random() * 1000 + 400;
                
                synthOsc.connect(synthFilter);
                synthFilter.connect(synthGain);
                synthGain.connect(master);
                
                synthGain.gain.setValueAtTime(0, ctx.currentTime);
                synthGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.02);
                synthGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                
                synthOsc.start();
                synthOsc.stop(ctx.currentTime + 0.2);
                
                noteIdx = (noteIdx + Math.floor(Math.random() * 3) + 1) % notes.length;
                setTimeout(scheduleNote, 200 + Math.random() * 50); 
            };
            scheduleNote();
        };
        playMusic();

        return {
            ctx,
            setMenuMusic: (active: boolean) => {
                musicActive = active;
                if (active) playMusic();
            },
            setSpeed: (v: number, vehicleType: string = 'coupe') => {
                const spd = Math.abs(v);
                
                const maxSpeed = 12;
                let normalized = Math.min(spd / maxSpeed, 1.0);
                
                // Simulated Gears
                let gear = Math.floor(normalized * 4);
                let rpm = (normalized * 4) - gear; 
                
                const jitter = (Math.random() * 3) * (spd > 0.5 ? 1 : 0);
                
                // Vehicle specific sound bases
                let baseFreq = 40;
                let osc1Type: OscillatorType = 'sawtooth';
                let osc2Type: OscillatorType = 'square';
                let noiseAmount = 0.01;
                
                if (vehicleType === 'truck') {
                    baseFreq = 30 + gear * 15 + rpm * 50 + jitter;
                    osc2Type = 'sawtooth';
                    noiseAmount = 0.02;
                } else if (vehicleType === 'semi') {
                    baseFreq = 20 + gear * 10 + rpm * 40 + jitter;
                    osc1Type = 'square';
                    noiseAmount = 0.03;
                } else if (vehicleType === 'motorcycle') {
                    baseFreq = 80 + gear * 30 + rpm * 120 + jitter;
                    osc1Type = 'sawtooth';
                    osc2Type = 'triangle';
                    noiseAmount = 0.005;
                } else {
                    // coupe
                    baseFreq = 40 + gear * 20 + rpm * 70 + jitter;
                }
                
                if (engineOsc1.type !== osc1Type) engineOsc1.type = osc1Type;
                if (engineOsc2.type !== osc2Type) engineOsc2.type = osc2Type;
                
                engineOsc1.frequency.setTargetAtTime(baseFreq, ctx.currentTime, 0.05);
                engineOsc2.frequency.setTargetAtTime(baseFreq * 0.5 + 2, ctx.currentTime, 0.05);
                
                filter.frequency.setTargetAtTime(200 + spd * 80 + (Math.random() * 50), ctx.currentTime, 0.05);
                
                noiseGain.gain.setTargetAtTime(noiseAmount + (spd * 0.002), ctx.currentTime, 0.1);
                engineGain.gain.setTargetAtTime(v > 0.05 ? 0.3 : 0.05, ctx.currentTime, 0.1);
            },
            playSkid: (intensity: number) => {
                // Realistic tire screech with noise
                const bufferSize = ctx.sampleRate * 0.3; // 300ms
                const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    // White noise
                    output[i] = Math.random() * 2 - 1;
                }
                
                const noiseSource = ctx.createBufferSource();
                noiseSource.buffer = noiseBuffer;
                
                const noiseFilter = ctx.createBiquadFilter();
                noiseFilter.type = 'bandpass';
                // Screech frequencies usually between 800-2000Hz
                noiseFilter.frequency.value = 1200 + Math.random() * 400; 
                noiseFilter.Q.value = 2.0;

                const g = ctx.createGain();
                
                noiseSource.connect(noiseFilter);
                noiseFilter.connect(g);
                g.connect(master);
                
                const vol = Math.min(intensity * 0.15, 0.5);
                g.gain.setValueAtTime(0, ctx.currentTime);
                g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05);
                g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                
                noiseSource.start();
            },
            beep: (freq = 440, duration = 0.1) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.connect(g);
                g.connect(master);
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                g.gain.setValueAtTime(0.5, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
                osc.start();
                osc.stop(ctx.currentTime + duration);
            },
            engineStart: () => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sawtooth';
                osc.connect(g);
                g.connect(master);
                osc.frequency.setValueAtTime(40, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
                g.gain.setValueAtTime(0.5, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
                osc.start();
                osc.stop(ctx.currentTime + 1.0);
            },
            explosion: () => {
                // Realistic metal crash
                const bufferSize = ctx.sampleRate * 0.8;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const output = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    // White noise then fading low frequency
                    output[i] = (Math.random() - 0.5) * Math.exp(-i / (ctx.sampleRate * 0.1));
                }
                
                const noise = ctx.createBufferSource();
                noise.buffer = buffer;
                
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 400; // Muffled impact
                
                const g = ctx.createGain();
                g.gain.setValueAtTime(4.0, ctx.currentTime); // Increased gain
                g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2); // Increased duration
                
                noise.connect(filter);
                filter.connect(g);
                g.connect(master);
                
                noise.start();
                noise.stop(ctx.currentTime + 1.2);
            },
            stop: () => {
                engineGain.gain.value = 0;
                musicActive = false;
            }
        };
    } catch (e) { return null; }
};

// --- Utilities ---
const darkenColor = (hex: string, amount = 40) => {
    const usePound = hex.startsWith('#');
    let color = usePound ? hex.slice(1) : hex;
    const num = parseInt(color, 16);
    let r = (num >> 16) - amount;
    let g = ((num >> 8) & 0x00FF) - amount;
    let b = (num & 0x0000FF) - amount;
    r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
    return (usePound ? "#" : "") + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audio = useRef<ReturnType<typeof createAudio>>(null);
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [menuState, setMenuState] = useState<MenuState>('main');
  const [mode, setMode] = useState<GameMode>('race');
  const [biome, setBiome] = useState<Biome>('plains');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('coupe');
  const [selectedAIVehicle, setSelectedAIVehicle] = useState<VehicleType>('coupe');
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [carColor, setCarColor] = useState(VEHICLE_COLORS[0]);
  const [countdown, setCountdown] = useState(3);
  const [laps, setLaps] = useState(0);
  const [lastCheck, setLastCheck] = useState(0);
  const [missedAlert, setMissedAlert] = useState(false);
  const driftBuffer = useRef(0);
  
  // --- Game State Refs
  const gameState = useRef({
    car: { x: 0, y: 0, angle: -Math.PI / 2, v: 0, vx: 0, vy: 0, laps: 0, lastCheck: -1, trailer: { x: 0, y: 0, angle: -Math.PI / 2, vx: 0, vy: 0 } } as CarState,
    keys: { w: false, a: false, s: false, d: false, space: false, p: false },
    obstacles: [] as Obstacle[],
    track: [] as { x: number; y: number }[],
    checkpoints: [] as number[],
    trails: [] as { x: number; y: number; a: number; opacity: number; color?: string; time: number }[],
    particles: [] as Particle[],
    skidMarks: [] as { x1: number; y1: number; x2: number; y2: number, color: string, time: number }[],
    parkingSpots: [] as { x: number; y: number; angle: number; width: number; height: number; type?: string }[],
    aiCars: [] as { x: number; y: number; angle: number; v: number; targetIdx: number; laps: number; type: VehicleType, color: string, state?: string, avoidAngle?: number, trailer?: { x: number; y: number; angle: number; vx: number; vy: number } }[],
    currentParkingSpotIdx: 0,
    camera: { x: 0, y: 0 },
    frame: 0,
    showParkedText: 0,
    maxLaps: 3,
    level: 1,
    winner: null as 'player' | 'ai' | null,
    difficulty: 'normal' as Difficulty,
    vLimit: 8,
    offRoad: false,
    isSandbox: false,
    worldBounds: 5000,
    sandboxSpeed: 1,
    sandboxDrift: 1,
    missedLastGate: false,
    prevMissedLastGate: false,
    absActive: false,
    tcsActive: false,
    phase: 'menu' as GamePhase,
    mode: 'horizon' as GameMode,
  });

  // Sandbox state
  const [isSandbox, setIsSandbox] = useState(false);
  const [sandboxSpeed, setSandboxSpeed] = useState(1);
  const [sandboxDrift, setSandboxDrift] = useState(1);
  const [showSandboxUI, setShowSandboxUI] = useState(false);

  useEffect(() => {
    if (isSandbox && phase === 'race') {
        setShowSandboxUI(true);
    } else {
        setShowSandboxUI(false);
    }
  }, [phase, isSandbox]);

  const [hasInteracted, setHasInteracted] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const music = new Audio('https://dancing-gumption-703914.netlify.app/tunetank-drift-phonk-music-phonk-mix-347394.mp3');
    music.loop = true;
    
    // Set time once metadata is loaded
    const setTime = () => {
        music.currentTime = 50;
    };
    music.addEventListener('loadedmetadata', setTime);
    
    musicRef.current = music;

    return () => {
        music.pause();
        music.removeEventListener('loadedmetadata', setTime);
        musicRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase === 'menu' && hasInteracted) {
        musicRef.current?.play().catch(e => console.error("Menu music play failed", e));
    } else {
        musicRef.current?.pause();
    }
  }, [phase, hasInteracted]);

  // Handle user interaction to start music
  const handleUserInteraction = () => {
    if (!hasInteracted) {
        setHasInteracted(true);
    }
  };

  useEffect(() => {
    window.addEventListener('click', handleUserInteraction, { once: true });
    window.addEventListener('keydown', handleUserInteraction, { once: true });
    return () => {
        window.removeEventListener('click', handleUserInteraction);
        window.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);


  // Keep ref in sync for the high-performance game loop closure
  useEffect(() => {
    gameState.current.phase = phase;
    gameState.current.mode = mode;
  }, [phase, mode]);

  // Start Countdown Effect
  useEffect(() => {
    if (phase === 'countdown' && mode === 'race') {
      if (countdown > 0) {
        audio.current?.beep(400 + (3 - countdown) * 200, 0.1);
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        audio.current?.beep(1000, 0.3);
        setPhase('race');
      }
    } else if (phase === 'countdown' && mode === 'free') {
        setPhase('race');
    }
  }, [phase, countdown, mode]);
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {

    const c = e.code; 

    if (c === 'KeyW' || c === 'ArrowUp') gameState.current.keys.w = true;
    if (c === 'KeyA' || c === 'ArrowLeft') gameState.current.keys.a = true;
    if (c === 'KeyS' || c === 'ArrowDown') gameState.current.keys.s = true;
    if (c === 'KeyD' || c === 'ArrowRight') gameState.current.keys.d = true;
    if (c === 'KeyP') gameState.current.keys.p = true;
    
    if (c === 'Space') {
        gameState.current.keys.space = true;

        e.preventDefault(); 
    }
    
    if (c === 'Escape') setPhase('menu');
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const c = e.code;

    if (c === 'KeyW' || c === 'ArrowUp') gameState.current.keys.w = false;
    if (c === 'KeyA' || c === 'ArrowLeft') gameState.current.keys.a = false;
    if (c === 'KeyS' || c === 'ArrowDown') gameState.current.keys.s = false;
    if (c === 'KeyD' || c === 'ArrowRight') gameState.current.keys.d = false;
    if (c === 'KeyP') gameState.current.keys.p = false;
    if (c === 'Space') gameState.current.keys.space = false;
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
}, []);
  const generateWorld = (targetMode: GameMode, selectedBiome: Biome, isSandbox: boolean) => {
    gameState.current.obstacles = [];
    const rawPoints: {x: number, y: number}[] = [];
    const splined: {x: number, y: number, angle: number}[] = [];
    
    if (targetMode === 'horizon') {
        setPhase('race');
        return;
    }
    
    if (targetMode === 'race') {
        const radius = 1200 + Math.random() * 600;
        const pts = 24; 
        let lastR = radius;
        for (let i = 0; i < pts; i++) {
            const a = (i / pts) * Math.PI * 2;
            const targetR = radius + Math.sin(i * 0.8) * 300 + Math.cos(i * 1.5) * 200 + (Math.random() - 0.5) * 150;
            lastR += (targetR - lastR) * 0.5;
            rawPoints.push({ x: Math.cos(a) * lastR, y: Math.sin(a) * lastR });
        }
        
        // Catmull-Rom interpolation for smooth curves
        for (let i = 0; i < rawPoints.length; i++) {
            const p0 = rawPoints[(i - 1 + rawPoints.length) % rawPoints.length];
            const p1 = rawPoints[i];
            const p2 = rawPoints[(i + 1) % rawPoints.length];
            const p3 = rawPoints[(i + 2) % rawPoints.length];
            
            for (let t = 0; t < 1; t += 0.2) {
                const tt = t * t;
                const ttt = tt * t;
                const q1 = -ttt + 2*tt - t;
                const q2 = 3*ttt - 5*tt + 2;
                const q3 = -3*ttt + 4*tt + t;
                const q4 = ttt - tt;
                
                const tx = 0.5 * (p0.x * q1 + p1.x * q2 + p2.x * q3 + p3.x * q4);
                const ty = 0.5 * (p0.y * q1 + p1.y * q2 + p2.y * q3 + p3.y * q4);
                
                splined.push({ x: tx, y: ty, angle: 0 }); // Angle calculated next
            }
        }
        
        // Compute tangent angles for checkpoints
        for (let i = 0; i < splined.length; i++) {
            const current = splined[i];
            const next = splined[(i + 1) % splined.length];
            current.angle = Math.atan2(next.y - current.y, next.x - current.x);
        }

        // Normalize
        if (splined.length > 0) {
            const startX = splined[0].x;
            const startY = splined[0].y;
            splined.forEach(p => { p.x -= startX; p.y -= startY; });
        }
        
        // Generate exactly 5 checkpoints based on points
        const numCheckpoints = 5;
        const cps: number[] = [];
        for (let i = 0; i < numCheckpoints; i++) {
            cps.push(Math.floor(i * splined.length / numCheckpoints));
        }
        gameState.current.checkpoints = cps;
    }
    
    gameState.current.track = splined;
    gameState.current.parkingSpots = [];
    gameState.current.aiCars = [];
    gameState.current.currentParkingSpotIdx = 0;

    if (targetMode === 'parking') {
        const level = gameState.current.level;
        const spotWidth = 110; 
        const spotHeight = 70; 
        const rows = 2; 
        const cols = 12; 
        const spacingX = 120; 
        const spacingY = 340; 
        
        const spots = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const angle = Math.PI / 2;
                spots.push({
                    x: (c - (cols - 1) / 2) * spacingX,
                    y: (r - (rows - 1) / 2) * spacingY,
                    angle: angle,
                    width: spotWidth,
                    height: spotHeight,
                    type: 'spot'
                });
            }
        }
        
        const shuffled = [...spots].sort(() => Math.random() - 0.5);
        // Level progression: More spots as level increases
        const targetCount = 2 + Math.floor(level / 2);
        gameState.current.parkingSpots = shuffled.slice(0, Math.min(targetCount, spots.length)).map(s => ({...s}));
        
        const obs: Obstacle[] = [];
        const targetSpots = gameState.current.parkingSpots;
        const vTypes: VehicleType[] = ['coupe', 'truck', 'semi', 'motorcycle'];
        
        spots.forEach(s => {
            const isTarget = targetSpots.some(ts => ts.x === s.x && ts.y === s.y);
            // More obstacles at higher levels - creates a more crowded lot
            const blockChance = Math.min(0.7 + (level * 0.1), 0.99);
            if (!isTarget && Math.random() < blockChance) {
                const randomType = vTypes[Math.floor(Math.random() * vTypes.length)];
                const randomHue = Math.floor(Math.random() * 360);
                obs.push({ 
                    x: s.x, 
                    y: s.y, 
                    type: 'rock', 
                    size: 30,
                    vType: randomType,
                    color: `hsl(${randomHue}, 70%, 50%)`,
                    angle: s.angle 
                } as any);
            }
        });
        gameState.current.obstacles = obs;

        // Roaming AI cars count increases significantly with level
        const lotWidth = cols * spacingX;
        const lotHeight = rows * spacingY;
        const colors = ['#f43f5e', '#3b82f6', '#fbbf24', '#a855f7', '#10b981', '#FF007F', '#39FF14'];
        
        // Add city buildings encircling the parking lot
        for(let i=0; i<80; i++) {
            const distFromCenter = Math.max(lotWidth, lotHeight) / 2 + 150 + Math.random() * 800; // Farther out
            const ang = Math.random() * Math.PI * 2;
            obs.push({
                x: Math.cos(ang) * distFromCenter,
                y: Math.sin(ang) * distFromCenter,
                type: 'building',
                size: 150 + Math.random() * 200,
                color: ['#1a1a1a', '#2a2a2a', '#3a3a3a'][Math.floor(Math.random() * 3)],
                angle: ang + Math.PI/2
            } as any);
        }

        // Quantity of AIs scales harder with levels
        const aiCount = 4 + Math.floor(level * 3);
        
        if (targetMode === 'parking') {
            for (let i = 0; i < Math.min(aiCount, 40); i++) {
                const side = Math.random() > 0.5 ? 1 : -1;
                
                // Randomize path
                const pathY = (Math.random() - 0.5) * lotHeight * 1.5; 
                const path = [
                    { x: -lotWidth/2 - 2000, y: pathY + (Math.random()-0.5)*200 },
                    { x: lotWidth/2 + 2000, y: pathY + (Math.random()-0.5)*200 },
                ];
                if (side === -1) path.reverse();

                // AI becomes faster and more aggressive at higher levels
                const speedBoost = 1.365 + (level * 0.2625); // Increased by 5%
                const isAggressive = level > 2 && Math.random() < Math.min(0.2 + (level * 0.1), 0.7);
                
                gameState.current.aiCars.push({
                    x: path[0].x,
                    y: path[0].y,
                    angle: side === 1 ? 0 : Math.PI,
                    v: (1.5 + Math.random() * 2) * speedBoost,
                    targetIdx: 1,
                    laps: 0,
                    type: vTypes[Math.floor(Math.random() * vTypes.length)],
                    color: colors[i % colors.length],
                    path: path,
                    vLimit: (4 + Math.random() * 2) * speedBoost,
                    state: 'roaming',
                    isAggressive: isAggressive
                } as any);
            }
        }
        
        // Add entry road to the parking lot
        obs.push({ x: 0, y: -(lotHeight/2 + 500), type: 'road', size: 1000, color: 'rgba(50,50,50,0.1)' });
        // Actually, for a real road, I should add it to the 'track' or have a way to define traversable areas.
        // For now, I'll just clear the obstacles in the middle to pretend there is a road.
        // return; // removed to fix TS error and allow city generation below
    }
    
    // Level scaling for Race Mode
    const level = gameState.current.level;
    const aiCount = 1 + Math.min(Math.floor(level / 2), 5); // Max 6 AIs
    const colors = ['#f43f5e', '#3b82f6', '#fbbf24', '#a855f7', '#10b981', '#FF007F'];
    
    if (targetMode === 'race' && splined.length > 1) {
        const start = splined[0];
        const next = splined[1];
        const startAngle = Math.atan2(next.y - start.y, next.x - start.x);
        const vTypes: VehicleType[] = ['coupe', 'truck', 'semi', 'motorcycle'];

        for (let i = 0; i < aiCount; i++) {
            const vType = i === 0 ? selectedAIVehicle : vTypes[Math.floor(Math.random() * vTypes.length)];
            const offset = (i + 1) * 65;
            gameState.current.aiCars.push({
                x: start.x + offset * Math.cos(startAngle + Math.PI/2),
                y: start.y + offset * Math.sin(startAngle + Math.PI/2),
                angle: startAngle,
                v: 0,
                targetIdx: 1,
                laps: 0,
                type: vType,
                color: colors[i % colors.length],
                racingLineOffset: (i % 2 === 0 ? 1 : -1) * (60 + Math.random() * 40),
                trailer: VEHICLE_CONFIGS[vType].hasTrailer ? { x: start.x + offset, y: start.y, angle: startAngle, vx: 0, vy: 0 } : undefined
            });
        }
    }
    
    const obs: Obstacle[] = targetMode === 'parking' ? [...gameState.current.obstacles] : [];
    
    if (!isSandbox) {
        const isRace = targetMode === 'race';
        const baseCount = isRace ? 600 : (targetMode === 'parking' ? 0 : 1200); 
        
        // Difficulty scaling for mud/potholes
        const diffLevel = ['easy', 'normal', 'hard', 'impossible'].indexOf(gameState.current.difficulty);
        const mudScaling = selectedBiome === 'muddy' ? (1 + diffLevel * 0.5) : 1;
        const count = Math.floor(baseCount * mudScaling);

        for (let i = 0; i < count; i++) {
            const ox = (Math.random() - 0.5) * (isRace ? WORLD_SIZE : 10000);
            const oy = (Math.random() - 0.5) * (isRace ? WORLD_SIZE : 10000);
            
            let valid = true;
            if (isRace) {
                for (const p of splined) {
                    const dist = Math.sqrt((ox-p.x)**2 + (oy-p.y)**2);
                    if (dist < TRACK_WIDTH + 150) { valid = false; break; }
                }
            } else if (targetMode === 'free') {
                // Keep center clear for free roam start
                if (Math.abs(ox) < 200 && Math.abs(oy) < 200) valid = false;
            }

            if (valid) {
                let type: Obstacle['type'] = ['tree', 'rock', 'cone'][Math.floor(Math.random() * 3)] as any;
                let size = 15 + Math.random() * 20;
                
                // Add potholes randomly in muddy biome (Not in race mode)
                if (!isRace && selectedBiome === 'muddy' && Math.random() < (0.05 + diffLevel * 0.05)) {
                    type = 'pothole';
                    size = 40 + Math.random() * 40;
                }

                obs.push({ x: ox, y: oy, type, size });
            }
        }
        
        // Cities for parking mode
        if (targetMode === 'parking') {
            for(let i=0; i<80; i++) {
                const distFromCenter = 800 + Math.random() * 1000;
                const ang = Math.random() * Math.PI * 2;
                obs.push({
                    x: Math.cos(ang) * distFromCenter,
                    y: Math.sin(ang) * distFromCenter,
                    type: Math.random() > 0.5 ? 'tree' : 'rock',
                    size: 80 + Math.random() * 150
                });
            }
        }
    }
    
    gameState.current.obstacles = obs;
  };

  const resetGame = (selectedMode: GameMode = mode, selectedBiome: Biome = biome, selectedDifficulty: Difficulty = difficulty, isSandbox: boolean = gameState.current.isSandbox, speed: number = 1, drift: number = 1) => {
    // Determine target mode and difficulty
    const targetMode = selectedMode;
    const targetDiff = selectedDifficulty;
    
    // Level progression logic
    if (gameState.current.winner === 'player') {
        gameState.current.level++;
    } else if (gameState.current.winner === null && phase !== 'menu' && mode === 'race') {
        // Only reset level in race mode on failure, preserve in parking/free
        gameState.current.level = 1; 
    } 
    setMode(targetMode);
    setBiome(selectedBiome);
    setDifficulty(targetDiff);
    gameState.current.difficulty = targetDiff;
    gameState.current.isSandbox = isSandbox;
    setIsSandbox(isSandbox);
    gameState.current.sandboxSpeed = speed;
    setSandboxSpeed(speed);
    gameState.current.sandboxDrift = drift;
    setSandboxDrift(drift);
    gameState.current.missedLastGate = false;
    // For infinite world in free roam
    gameState.current.worldBounds = 5000;
    
    setLaps(0);
    setLastCheck(0);

    if (!audio.current) audio.current = createAudio();
    audio.current?.engineStart();
    
    generateWorld(targetMode, selectedBiome, isSandbox);
    
    // Setup car and phase
    const track = gameState.current.track;
    // Reset winner state properly for all modes
    gameState.current.winner = null;
    gameState.current.health = 3;

    if (targetMode === 'race' && track && track.length > 1) {
        const start = track[0];
        const next = track[1];
        const startAngle = Math.atan2(next.y - start.y, next.x - start.x);
        gameState.current.car = { x: start.x, y: start.y, angle: startAngle, v: 0, vx: 0, vy: 0, laps: 0, lastCheck: 0, trailer: VEHICLE_CONFIGS[selectedVehicle].hasTrailer ? { x: start.x, y: start.y, angle: startAngle, vx: 0, vy: 0 } : undefined };
        gameState.current.camera = { x: start.x, y: start.y };
        setCountdown(3);
        setPhase('countdown');
    } else if (targetMode === 'parking') {
        gameState.current.car = { x: 0, y: 300, angle: -Math.PI / 2, v: 0, vx: 0, vy: 0, laps: 0, lastCheck: -1, trailer: { x: 0, y: 300, angle: -Math.PI / 2, vx: 0, vy: 0 } };
        gameState.current.camera = { x: 0, y: 300 };
        setPhase('race');
    } else if (targetMode === 'horizon') {
        gameState.current.car = { x: 0, y: 0, angle: -Math.PI / 2, v: 0, vx: 0, vy: 0, laps: 0, lastCheck: -1 };
        gameState.current.camera = { x: 0, y: 0 };
        setPhase('race');
    } else {
        gameState.current.car = { x: 0, y: 0, angle: -Math.PI / 2, v: 0, vx: 0, vy: 0, laps: 0, lastCheck: -1, trailer: VEHICLE_CONFIGS[selectedVehicle].hasTrailer ? { x: 0, y: 0, angle: -Math.PI / 2, vx: 0, vy: 0 } : undefined };
        gameState.current.camera = { x: 0, y: 0 };
        setPhase('race');
    }
    
    gameState.current.trails = [];
    gameState.current.particles = [];
    setDistance(0);
  };

  useEffect(() => {
    if (phase === 'menu' || phase === 'difficulty') {
        audio.current?.setSpeed(0);
        return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const drawCar = (c: any, color: string, ctx: CanvasRenderingContext2D, theme: any, keys: any, type: VehicleType = 'coupe', isTrailer: boolean = false) => {
      ctx.save();
      const pos = isTrailer && c.trailer ? c.trailer : c;
      const angle = isTrailer && c.trailer ? c.trailer.angle : c.angle;
      ctx.translate(pos.x, pos.y);
      
      const config = VEHICLE_CONFIGS[type];
      const w = config.width;
      const l = config.length;
      
      // Dynamic Tilt based on turning and velocity
      const tiltFactor = (keys.a ? -1 : keys.d ? 1 : 0) * (Math.abs(c.v) / (theme.maxSpeedKmh / SPEED_UNIT)) * (type === 'motorcycle' ? 0.4 : 0.15);
      ctx.rotate(angle + (isTrailer ? 0 : tiltFactor));
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.rect(-l/2, -w/2 - 2, l, w + 4);
      ctx.fill();

      const layers = config.layers;
      for (let i = 0; i < layers; i++) {
        ctx.save();
        const layerOffset = -i * 1.0;
        ctx.translate(0, layerOffset);
        
        if (type === 'motorcycle') {
            // Extreme Detail Sportbike Stacking
            if (i < 3) {
                ctx.fillStyle = '#111'; // Tires
                ctx.fillRect(l/2 - 6, -1.5, 8, 3); // Front
                ctx.fillRect(-l/2, -1.5, 9, 3.5); // Rear
            } else if (i < 7) {
                // Main Chassis / Fairings
                ctx.fillStyle = i === 6 ? color : darkenColor(color, 40);
                ctx.fillRect(-l/4, -w/2, l/1.5, w);
                // Front Fork
                ctx.fillStyle = '#444';
                ctx.fillRect(l/2 - 10, -w/2, 4, w);
            } else if (i < 9) {
                // Tank & Cowl
                ctx.fillStyle = color;
                ctx.fillRect(-2, -w/2 - 1, l/2.5, w + 2); // Tank
                if (i === 7) {
                    ctx.fillStyle = '#222';
                    ctx.fillRect(l/4 + 2, -w/2 - 3, 2, w + 6); // Handlebars
                }
                if (i === 8) {
                    ctx.fillStyle = '#111';
                    ctx.fillRect(l/2 - 8, -w/2 + 2, 4, w - 4); // Windscreen
                }
            } else {
                // Rider leaning
                const isHead = i === layers - 1;
                if (isHead) {
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(6, 0, 4.5, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#000'; ctx.fillRect(8.5, -2, 2, 4); // Visor
                } else {
                    ctx.fillStyle = '#111';
                    ctx.fillRect(-4, -w/2 + 2, 14, w - 4); // Leapers tucked
                }
            }
            if (i === 6) {
                ctx.fillStyle = '#f00'; ctx.fillRect(-l/2, -2, 2, 4);
                ctx.fillStyle = '#ffc'; ctx.fillRect(l/2 - 2, -2, 2, 4);
            }
        } else if (type === 'semi' && isTrailer) {
            // Improved Trailer
            if (i < 3) {
                // Trailer wheels (rear)
                ctx.fillStyle = '#111';
                ctx.fillRect(-35, -18, 14, 6); ctx.fillRect(-35, 12, 14, 6);
                ctx.fillRect(-18, -18, 14, 6); ctx.fillRect(-18, 12, 14, 6);
            } else if (i < layers - 1) {
                ctx.fillStyle = '#f2f2f2'; 
                ctx.fillRect(-45, -17, 85, 34); // Slightly longer trailer
                
                // Trailer details (stripes)
                if (i === 5 || i === 8) {
                    ctx.fillStyle = '#ccc';
                    ctx.fillRect(-40, -17, 2, 34);
                    ctx.fillRect(-20, -17, 2, 34);
                    ctx.fillRect(0, -17, 2, 34);
                    ctx.fillRect(20, -17, 2, 34);
                }
            } else {
                // Roof
                ctx.fillStyle = '#fff';
                ctx.fillRect(-45, -17, 85, 34);
                ctx.fillStyle = '#ccc'; // Roof vent detail
                ctx.fillRect(20, -10, 10, 20);
            }
        } else if (type === 'semi' && !isTrailer) {
            // Improved Semi Tractor
            if (i < 3) {
                // Wheels
                ctx.fillStyle = '#111';
                ctx.fillRect(10, -19, 12, 8); ctx.fillRect(10, 11, 12, 8); // Front
                ctx.fillRect(-15, -19, 12, 8); ctx.fillRect(-15, 11, 12, 8); // Mid
                ctx.fillRect(-28, -19, 12, 8); ctx.fillRect(-28, 11, 12, 8); // Rear
            } else if (i < 8) {
                // Chassis and Engine block
                ctx.fillStyle = i === 7 ? color : '#333';
                ctx.fillRect(-32, -16, 64, 32); 
            } else if (i < 14) {
                // Huge Cabin
                ctx.fillStyle = '#1a1a1a'; // Cab interior/glass
                ctx.fillRect(-5, -15, 35, 30);
                
                // Sleeper cab part
                ctx.fillStyle = color;
                ctx.fillRect(-5, -15, 15, 30);

                if (i > 10) {
                    ctx.fillStyle = '#3bc'; ctx.globalAlpha = 0.5;
                    ctx.fillRect(28, -13, 2, 26); // Windshield
                    ctx.fillRect(10, -15, 15, 2); // Side window
                    ctx.fillRect(10, 13, 15, 2); // Side window
                    ctx.globalAlpha = 1;
                }
            } else {
                // Roof and spoiler
                ctx.fillStyle = color;
                ctx.fillRect(-5, -15, 30, 30);
                // Roof aero spoiler
                ctx.fillStyle = darkenColor(color, 20);
                ctx.beginPath();
                ctx.moveTo(-5, -15);
                ctx.lineTo(-5, 15);
                ctx.lineTo(25, 10);
                ctx.lineTo(25, -10);
                ctx.fill();
            }
        } else if (type === 'truck') {
            // Improved Pickup Truck
            if (i < 3) {
                // Big offroad wheels
                ctx.fillStyle = '#111';
                ctx.fillRect(15, -18, 14, 8); ctx.fillRect(15, 10, 14, 8);
                ctx.fillRect(-20, -18, 14, 8); ctx.fillRect(-20, 10, 14, 8);
            } else if (i < 9) {
                // Main body
                ctx.fillStyle = color;
                ctx.beginPath();
                // @ts-ignore
                if (ctx.roundRect) ctx.roundRect(-l/2, -w/2, l, w, 3); else ctx.rect(-l/2, -w/2, l, w);
                ctx.fill();
                
                // Truck Bed container
                if (i >= 5) {
                    ctx.fillStyle = '#222';
                    ctx.fillRect(-l/2 + 2, -w/2 + 3, l * 0.45, w - 6);
                }
                
                // Front Grille
                if (i === 6 || i === 7) {
                    ctx.fillStyle = '#444';
                    ctx.fillRect(l/2 - 4, -w/2 + 4, 4, w-8);
                    ctx.fillStyle = '#silver';
                    ctx.fillRect(l/2 - 2, -w/2 + 4, 2, 2);
                    ctx.fillRect(l/2 - 2, w/2 - 6, 2, 2);
                }
            } else if (i < layers - 1) {
                const cabStart = -2;
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(cabStart, -w/2 + 1, l/2 - cabStart - 5, w - 2);
                
                if (i > 10) {
                    ctx.fillStyle = '#3bc'; ctx.globalAlpha = 0.5;
                    ctx.fillRect(l/2 - 10, -w/2 + 2, 3, w - 4); // Windshield
                    ctx.globalAlpha = 1;
                }
                
                // Roof Lights
                if (i === layers - 2) {
                   ctx.fillStyle = '#ff9900';
                   ctx.fillRect(l/2 - 12, -8, 2, 2);
                   ctx.fillRect(l/2 - 12, 0, 2, 2);
                   ctx.fillRect(l/2 - 12, 8, 2, 2);
                }
            } else {
                const cabStart = 0;
                ctx.fillStyle = color;
                ctx.beginPath();
                // @ts-ignore
                if (ctx.roundRect) ctx.roundRect(cabStart, -w/2 + 2, l/2 - cabStart - 7, w - 4, 2); else ctx.rect(cabStart, -w/2 + 2, l/2 - cabStart - 7, w - 4);
                ctx.fill();
            }
        } else if (type === 'cyber') {
            // High-detail Cyber Drift car
            const isHead = i === layers - 1;
            if (i < 4) {
                ctx.fillStyle = '#111'; // Low-profile tires
                ctx.fillRect(l/2 - 12, -w/2, 10, 4); 
                ctx.fillRect(l/2 - 12, w/2 - 4, 10, 4);
                ctx.fillRect(-l/2 + 2, -w/2, 10, 4); 
                ctx.fillRect(-l/2 + 2, w/2 - 4, 10, 4);
            } else if (i < 12) {
                ctx.fillStyle = i === 11 ? color : darkenColor(color, 50);
                // Aggressive wedge shape
                ctx.beginPath();
                ctx.moveTo(-l/2, -w/2);
                ctx.lineTo(l/2, -w/4);
                ctx.lineTo(l/2, w/4);
                ctx.lineTo(-l/2, w/2);
                ctx.fill();
                
                if (i === 10) {
                    ctx.fillStyle = '#00E5FF'; // Neon side strip
                    ctx.fillRect(-l/2 + 5, -w/2 + 1, l - 10, 1.5);
                    ctx.fillRect(-l/2 + 5, w/2 - 2.5, l - 10, 1.5);
                }
            } else if (i < 16) {
                // Futuristic cockpit
                ctx.fillStyle = '#050505';
                ctx.fillRect(-2, -w/3, l/2, w*0.66);
                if (i > 13) {
                    ctx.fillStyle = '#00E5FF'; ctx.globalAlpha = 0.3;
                    ctx.fillRect(l/4 - 2, -w/3 + 2, 4, w*0.66 - 4); // Digital dash glow
                    ctx.globalAlpha = 1;
                }
            } else {
                // Roof details
                ctx.fillStyle = color;
                ctx.fillRect(0, -w/4, l/4, w/2);
                
                if (isHead) {
                    // Rear spoiler
                    ctx.fillStyle = '#111';
                    ctx.fillRect(-l/2, -w/2, 5, w);
                    ctx.fillStyle = color;
                    ctx.fillRect(-l/2 - 2, -w/2 - 3, 10, 5);
                    ctx.fillRect(-l/2 - 2, w/2 - 2, 10, 5);
                }
            }
            // Dynamic highlights
            if (i === 8) {
                ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8;
                ctx.fillRect(l/2 - 5, -w/4, 2, 4); // Headlights
                ctx.fillRect(l/2 - 5, w/4 - 4, 2, 4);
                ctx.globalAlpha = 1;
            }
            if (i === 7) {
                // Tail bar
                ctx.fillStyle = '#f00';
                ctx.shadowBlur = 15; ctx.shadowColor = '#f00';
                ctx.fillRect(-l/2, -w/3, 3, w*0.66);
                ctx.shadowBlur = 0;
            }
        } else {
            // Coupe Stacking (Original)
          if (i < 2) { 
            ctx.fillStyle = '#111';
            ctx.fillRect(8, -14, 8, 6); ctx.fillRect(8, 8, 8, 6);
            ctx.fillRect(-16, -14, 8, 6); ctx.fillRect(-16, 8, 8, 6);
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(-12, -10, 24, 20);
          }
          else if (i < 8) {
            ctx.fillStyle = color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(-18, -12, 36, 24);
            ctx.fill();
            ctx.stroke();

            if (i === 6) {
                ctx.fillStyle = color;
                ctx.fillRect(4, -15, 3, 4);
                ctx.fillRect(4, 11, 3, 4);
            }

            if (i >= 5 && i <= 8) {
                ctx.fillStyle = '#111';
                ctx.fillRect(-18, -10, 2, 20);
                if (i === 8) {
                    ctx.fillStyle = color;
                    ctx.fillRect(-20, -12, 4, 24);
                }
            }
          }
          else {
            const isRoof = i === layers - 1;
            ctx.fillStyle = isRoof ? color : '#1a1a1a';
            ctx.beginPath();
            // @ts-ignore
            if (ctx.roundRect) ctx.roundRect(-10, -10, 20, 20, 4); else ctx.rect(-10, -10, 20, 20);
            ctx.fill();
            if (i >= 8 && i < layers - 1) {
                ctx.fillStyle = color;
                ctx.fillRect(-10, -10, 2, 2); ctx.fillRect(-10, 8, 2, 2);
                ctx.fillRect(8, -10, 2, 2); ctx.fillRect(8, 8, 2, 2);
                ctx.fillStyle = '#3bc'; ctx.globalAlpha = 0.4;
                ctx.fillRect(6, -8, 4, 16);
                ctx.fillRect(-8, -9, 14, 2); ctx.fillRect(-8, 7, 14, 2);
                ctx.globalAlpha = 1;
            }
          }
        }
        
        // Universal details
        if (i === 5 && type !== 'motorcycle') {
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
            ctx.fillRect(l/2 - 2, -w/2 + 4, 3, 6); ctx.fillRect(l/2 - 2, w/2 - 10, 3, 6);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#f00';
            ctx.fillRect(-l/2 - 1, -w/2 + 5, 2, 5); ctx.fillRect(-l/2 - 1, w/2 - 10, 2, 5);
        }
        
        ctx.restore();
      }

      ctx.restore();
    };

    const update = () => {
      const { car, aiCars, keys, obstacles, track, trails, camera } = gameState.current;
      const theme = BIOMES[biome];
      if (!theme) return; // Safety check
      let currentFriction = theme.friction;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Reset transform at the start of every frame to prevent state accumulation
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const vehicle = VEHICLE_CONFIGS[selectedVehicle];
      const currentPhase = gameState.current.phase;
      
      if (currentPhase === 'race') {
        let currentAccel = ACCEL * vehicle.accelMult * 1.2;
        currentFriction = theme.friction;
        let currentTraction = theme.traction;

        // Off-road detection (only in race mode)
        let offRoad = false;
        if (mode === 'race') {
            offRoad = true;
            for (let i = 0; i < track.length; i++) {
                const p1 = track[i];
                const p2 = track[(i + 1) % track.length];
                
                // Distance to line segment
                const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
                if (l2 === 0) continue;
                let t = ((car.x - p1.x) * (p2.x - p1.x) + (car.y - p1.y) * (p2.y - p1.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                const dist = Math.sqrt((car.x - (p1.x + t * (p2.x - p1.x)))**2 + (car.y - (p1.y + t * (p2.y - p1.y)))**2);
                
                if (dist < TRACK_WIDTH / 2 + 30) {
                    offRoad = false;
                    break;
                }
            }
        }

        let vLimit = theme.maxSpeedKmh / SPEED_UNIT;

        if (offRoad) {
            currentAccel *= 0.6; // Less punishing acceleration drop
            vLimit *= theme.offRoadPenalty; // 50% to 80% speed capacity
            gameState.current.offRoad = true;
            
            // Add skid mark line
            if (Math.abs(car.v) > 2) {
                const prevX = car.x - Math.cos(car.angle) * 5;
                const prevY = car.y - Math.sin(car.angle) * 5;
                
                // Biome-specific off-road dust colors
                const SMOKE_COLORS: Record<Biome, string> = {
                    plains: 'rgba(150, 200, 150, 0.5)',
                    winter: 'rgba(230, 230, 240, 0.6)',
                    sand: 'rgba(255, 230, 150, 0.6)',
                    muddy: 'rgba(100, 70, 40, 0.6)',
                };
                let smokeColor = SMOKE_COLORS[biome] || 'rgba(255,255,255,0.3)';

                // Off-road dust/skid lines
                gameState.current.skidMarks.push({ x1: prevX, y1: prevY, x2: car.x, y2: car.y, color: smokeColor, time: gameState.current.frame });
                if (gameState.current.skidMarks.length > 2000) gameState.current.skidMarks.shift();

                // Spawn dust particles
                const intensity = Math.min(Math.abs(car.v) / 10, 3);
                for (let k = 0; k < intensity; k++) {
                    gameState.current.particles.push({
                        x: car.x + (Math.random() - 0.5) * 20,
                        y: car.y + (Math.random() - 0.5) * 20,
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2,
                        life: 1,
                        color: smokeColor.replace('0.3', '0.4').replace('0.4', '0.5'),
                    });
                }
            }

            // Desert "stuck in sand" mechanic
            if (biome === 'sand') {
                const diffLevel = ['easy', 'normal', 'hard', 'impossible'].indexOf(difficulty);
                const stuckProb = (diffLevel + 1) * 0.005;
                if (Math.random() < stuckProb && Math.abs(car.v) > 1) {
                    car.v *= 0.2; // Sudden slow down
                }
            }
        } else {
            gameState.current.offRoad = false;
            // Drifting marks (on-road rubber)
            const speed = Math.abs(car.v);
            const lateralVel = Math.abs(car.vx * Math.sin(car.angle) - car.vy * Math.cos(car.angle));
            
            // Drift detection
            if (speed > 3 && lateralVel > 1.0) {
                audio.current?.playSkid(lateralVel);
                const prevX = car.x - Math.cos(car.angle) * 5;
                const prevY = car.y - Math.sin(car.angle) * 5;
                gameState.current.skidMarks.push({ x1: prevX, y1: prevY, x2: car.x, y2: car.y, color: 'rgba(0,0,0,0.5)', time: gameState.current.frame });
                
                // Drift smoke (rubber friction)
                const SMOKE_COLORS: Record<Biome, string> = {
                    plains: 'rgba(150, 200, 150, 0.5)',
                    winter: 'rgba(230, 230, 240, 0.6)',
                    sand: 'rgba(255, 230, 150, 0.6)',
                    muddy: 'rgba(100, 70, 40, 0.6)',
                };
                const driftSmokeColor = SMOKE_COLORS[biome] || 'rgba(200,200,200,0.5)';
                const intensity = Math.min(lateralVel * 0.5, 4);
                for (let k = 0; k < intensity; k++) {
                  gameState.current.particles.push({
                      x: car.x + (Math.random() - 0.5) * 15,
                      y: car.y + (Math.random() - 0.5) * 15,
                      vx: (Math.random() - 0.5) * 3,
                      vy: (Math.random() - 0.5) * 3,
                      life: 0.8,
                      color: driftSmokeColor,
                  });
                }
                if (gameState.current.skidMarks.length > 800) gameState.current.skidMarks.shift();
            }

            // Burnout / Aggressive acceleration smoke
            if (keys.w && speed < (theme.maxSpeedKmh / 4) / SPEED_UNIT) {
                const tireSmokeProb = 0.2 + (vehicle.accelMult * 0.1);
                if (Math.random() < tireSmokeProb) {
                    gameState.current.particles.push({
                        x: car.x - Math.cos(car.angle) * (vehicle.length / 2),
                        y: car.y - Math.sin(car.angle) * (vehicle.length / 2),
                        vx: -Math.cos(car.angle) * 2 + (Math.random() - 0.5) * 2,
                        vy: -Math.sin(car.angle) * 2 + (Math.random() - 0.5) * 2,
                        life: 0.6,
                        color: 'rgba(240,240,240,0.6)',
                    });
                }
            }
        }

        // Movement Input
        gameState.current.absActive = false;
        gameState.current.tcsActive = false;

        if (gameState.current.mode === 'horizon' && currentPhase === 'race') {
            // Handled by LittleJS
            return;
        } else {
            if (keys.w) {
                let accelPower = ACCEL * vehicle.accelMult * gameState.current.sandboxSpeed;
                // TCS: Limit accel on low traction or high power wheelspin
                const isWheelSpinning = currentTraction < 0.7 && Math.abs(car.v) < 4;
                if (isWheelSpinning) {
                    accelPower *= 0.6;
                    gameState.current.tcsActive = true;
                }
                // Real vibe: occasional flicker when near traction limit
                if (currentTraction < 0.8 && Math.random() < 0.02) gameState.current.tcsActive = true;
                
                car.v += accelPower;
            }

            if (keys.s) {
                let brakePower = ACCEL * 0.8 * vehicle.accelMult;
                // ABS: Brake modulation at high speed or during steering
                const isLockingUp = Math.abs(car.v) > 3 && (keys.a || keys.d || Math.abs(car.vx) > 2);
                if (isLockingUp) {
                    brakePower *= 0.5;
                    gameState.current.absActive = true;
                }
                // Real vibe: occasional flicker when braking hard
                if (Math.abs(car.v) > 5 && Math.random() < 0.03) gameState.current.absActive = true;
                
                car.v -= brakePower;
            }
        }
        
        // Final velocity limit state preserved for end of loop
        gameState.current.vLimit = vLimit * gameState.current.sandboxSpeed;

        const currentSteer = STEER * (Math.min(Math.abs(car.v), 4) / 4) * currentTraction * vehicle.steerMult;
        const steerDir = car.v < 0 ? -1 : 1;
        if (keys.a) car.angle -= currentSteer * steerDir;
        if (keys.d) car.angle += currentSteer * steerDir;

        // Respawn at last checkpoint
        if (keys.space && mode === 'race') {
            const cpIdx = gameState.current.checkpoints[car.lastCheck] ?? 0;
            const cp = track[cpIdx] || track[0];
            const nextIdx = gameState.current.checkpoints[(car.lastCheck + 1) % gameState.current.checkpoints.length] ?? 1;
            const next = track[nextIdx] || track[0];
            if (cp && next) {
               car.x = cp.x; car.y = cp.y;
               car.angle = Math.atan2(next.y - cp.y, next.x - cp.x);
               car.v = car.vx = car.vy = 0;
               audio.current?.engineStart();
            }
            gameState.current.keys.space = false;
            gameState.current.missedLastGate = false;
        }
      }
      // Checkpoint Guidance Force (Magnetic Pull towards the GATE)
      let missed = false;
      if (mode === 'race' && currentPhase === 'race' && gameState.current.checkpoints.length > 0) {
          const nextCpIdx = (car.lastCheck + 1) % gameState.current.checkpoints.length;
          const targetTrackIdx = gameState.current.checkpoints[nextCpIdx];
          const target = track[targetTrackIdx];
          if (target) {
              const dx = target.x - car.x;
              const dy = target.y - car.y;
              const d = Math.sqrt(dx*dx + dy*dy);
              
              // Missed detection: Only trigger if completely bypassed and driving far away from the local gate area
              if (d > 1000 && !gameState.current.isSandbox) {
                   // actually, since checkpoints are far apart, 1000 might be too small on a huge map.
                   // We will rely on gate intersection to handle "missed", not distance.
              }

              if (d < 600 && d > 30) {
                  const nextNode = track[(targetTrackIdx + 1) % track.length];
                  let gateAngle = car.angle;
                  if (nextNode) {
                      gateAngle = Math.atan2(nextNode.y - target.y, nextNode.x - target.x);
                  }
                  
                  const angleToTarget = Math.atan2(dy, dx);
                  let diff = angleToTarget - car.angle;
                  while (diff > Math.PI) diff -= Math.PI * 2;
                  while (diff < -Math.PI) diff += Math.PI * 2;
                  
                  // Stronger pull when closer to the gate to ensure they go THROUGH it
                  if (Math.abs(diff) < 1.2) {
                      const pullStrength = 0.015 * (1 - d/600) * (keys.w ? 1 : 0.6);
                      car.angle += diff * pullStrength;
                      
                      if (gameState.current.frame % 10 === 0 && d < 150) {
                           gameState.current.particles.push({
                               x: car.x + (Math.random()-0.5)*20, 
                               y: car.y + (Math.random()-0.5)*20, 
                               vx: dx/d * 8, vy: dy/d * 8, 
                               life: 0.4, color: '#39FF14'
                           });
                      }
                  }
              }
          }
      }

      // Handle Respawn from Missed Checkpoint
      if (missed && keys.space) {
          const spawnPoint = track[car.lastCheck];
          const nextPoint = track[(car.lastCheck + 1) % track.length];
          car.x = spawnPoint.x;
          car.y = spawnPoint.y;
          car.v = 0;
          car.angle = Math.atan2(nextPoint.y - spawnPoint.y, nextPoint.x - spawnPoint.x);
          gameState.current.keys.space = false; // Prevent jump if that exists
      }

      car.v *= currentFriction;
      
      // Strict velocity cap based on current conditions (track/offroad)
      const vLimit = gameState.current.vLimit || (theme.maxSpeedKmh / SPEED_UNIT);
      const finalLimit = vLimit * vehicle.speedMult;
      if (car.v > finalLimit) car.v = finalLimit;
      if (car.v < -finalLimit * 0.5) car.v = -finalLimit * 0.5;

      const tx = Math.cos(car.angle) * car.v;
      const ty = Math.sin(car.angle) * car.v;
      car.vx += (tx - car.vx) * (1 - DRIFT_FACTOR);
      car.vy += (ty - car.vy) * (1 - DRIFT_FACTOR);
      car.x += car.vx;
      car.y += car.vy;

      // Trailer Physics
      if (vehicle.hasTrailer && car.trailer) {
          const hitchX = car.x - Math.cos(car.angle) * 30; // Move hitch further back on cab
          const hitchY = car.y - Math.sin(car.angle) * 30;
          const dx = car.trailer.x - hitchX;
          const dy = car.trailer.y - hitchY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const trailerHitchDist = 55; // Increase gap between truck and trailer
          
          if (dist > 0) {
              car.trailer.x = hitchX + (dx / dist) * trailerHitchDist;
              car.trailer.y = hitchY + (dy / dist) * trailerHitchDist;
              car.trailer.angle = Math.atan2(hitchY - car.trailer.y, hitchX - car.trailer.x);
          }
      }

      audio.current?.setSpeed(car.v, selectedVehicle);

      // HANDBRAKE / DRIFT logic (P key)
      if (keys.p) {
          const speedMph = Math.abs(car.v * 6.0);
          
          if (speedMph < 15) {
              // Gradual controlled stop (Parking Brake)
              car.v *= 0.88;
              if (Math.abs(car.v) < 0.1) car.v = 0;
          } else {
              // Handbrake / Drift
              car.v *= 0.95; 
              const turnDir = (keys.a ? -1 : keys.d ? 1 : 0);
              if (turnDir !== 0) {
                  // Aggressive tail rotation
                  car.angle += turnDir * (0.12 * gameState.current.sandboxDrift) * (car.v > 0 ? 1 : -1);
                  
                  // Skid marks
                  if (gameState.current.frame % 2 === 0) {
                      gameState.current.skidMarks.push({
                          x1: car.x, y1: car.y,
                          x2: car.x - Math.cos(car.angle) * 20,
                          y2: car.y - Math.sin(car.angle) * 20,
                          color: 'rgba(0,0,0,0.5)',
                          time: gameState.current.frame
                      });
                  }
              }
          }
      }

      // Parking Detection
      if (mode === 'parking' && currentPhase === 'race') {
          const spot = gameState.current.parkingSpots[gameState.current.currentParkingSpotIdx];

          if (spot) {
              const dxGlobal = car.x - spot.x;
              const dyGlobal = car.y - spot.y;
              const cosT = Math.cos(spot.angle);
              const sinT = Math.sin(spot.angle);
              const dxLocal = dxGlobal * cosT + dyGlobal * sinT;
              const dyLocal = -dxGlobal * sinT + dyGlobal * cosT;
              
              // Normalize angle for comparison
              let normAngle = car.angle % (Math.PI * 2);
              if (normAngle < 0) normAngle += Math.PI * 2;
              
              const targetAngle = spot.angle % (Math.PI * 2);
              const angleDiff = Math.min(
                  Math.abs(normAngle - targetAngle), 
                  Math.abs(normAngle - (targetAngle + Math.PI * 2)),
                  Math.abs(normAngle - (targetAngle - Math.PI * 2)),
                  Math.abs(normAngle - (targetAngle + Math.PI)), 
                  Math.abs(normAngle - (targetAngle - Math.PI))
              );
              
              // TIGHTER DETECTION: +35px tolerance (reduced from +60), lower speed
              if (Math.abs(dxLocal) < spot.width/2 + 35 && Math.abs(dyLocal) < spot.height/2 + 35 && Math.abs(car.v) < 0.4 && angleDiff < 0.5) {
                  audio.current?.beep(880, 0.2);
                  gameState.current.showParkedText = 120; // 2 seconds at 60fps
                  
                  const distFromCenter = Math.sqrt(dxLocal*dxLocal + dyLocal*dyLocal);
                  const precision = distFromCenter < 18 ? 'PERFECT!' : distFromCenter < 35 ? 'GOOD!' : 'PARKED';
                  
                  gameState.current.particles.push({
                      x: car.x, y: car.y - 60, vx: 0, vy: -1.5, life: 1.5, color: '#39FF14', text: precision
                  });

                  gameState.current.currentParkingSpotIdx++;
                  
                  // Burst particles
                  for(let i=0; i<30; i++) {
                      gameState.current.particles.push({
                          x: car.x + (Math.random()-0.5)*40,
                          y: car.y + (Math.random()-0.5)*40,
                          vx: (Math.random()-0.5)*12,
                          vy: (Math.random()-0.5)*12,
                          life: 1,
                          color: '#39FF14'
                      });
                  }

                  if (gameState.current.currentParkingSpotIdx >= gameState.current.parkingSpots.length) {
                      gameState.current.winner = 'player';
                      setShowLevelComplete(true);
                      setTimeout(() => {
                        setShowLevelComplete(false);
                        resetGame('parking', biome, difficulty);
                      }, 2000);
                  } else {
                      // Small text notification for next spot
                      gameState.current.particles.push({
                        x: car.x, y: car.y - 100, vx: 0, vy: -0.5, life: 1, color: '#FFEA00', text: `NEXT SPOT: ${gameState.current.currentParkingSpotIdx + 1}`
                      });
                  }
              }
          }
      }

      // --- ENHANCED AI ENGINE (Racing & Traffic) ---
      gameState.current.aiCars.forEach(ac => {
              if (!ac.state) ac.state = 'roaming';
              
              // 0. Decision Logic: Pick a spot if roaming (STRICTLY DISABLED IN RACE MODE)
              if (gameState.current.mode !== 'race' && ac.state === 'roaming' && Math.random() < 0.005) {
                  const availableSpots = gameState.current.parkingSpots.filter((s, idx) => {
                      if (idx === gameState.current.currentParkingSpotIdx) return false;
                      const occupiesRock = gameState.current.obstacles.some(ob => Math.abs(ob.x - s.x) < 10 && Math.abs(ob.y - s.y) < 10);
                      if (occupiesRock) return false;
                      return !gameState.current.aiCars.some(other => other !== ac && other.targetSpot === s);
                  });
                  if (availableSpots.length > 0) {
                      ac.targetSpot = availableSpots[Math.floor(Math.random() * availableSpots.length)];
                      ac.state = 'searching';
                  }
              }

              // 1. Proximity Raycasting / Sensor Logic
              let obstacleInFront = false;
              let avoidanceVector = { x: 0, y: 0 };
              
              // Active Sensor Logic (only when moving and not precisely maneuvering)
              if (ac.state !== 'parked') {
                // Detect other AI cars (player is excluded)
                const others = gameState.current.aiCars.filter(o => o !== ac);
                others.forEach(other => {
                    const dx = other.x - ac.x;
                    const dy = other.y - ac.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const isRace = !ac.path;
                    let sensorRange = isRace ? 100 : 180;
                    if (ac.state === 'maneuvering') sensorRange = 60;

                    if (dist < sensorRange) {
                        const angleToOther = Math.atan2(dy, dx);
                        let relativeAngle = angleToOther - ac.angle;
                        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
                        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
                        
                    // Tight FOV for racing AI
                        const fov = isRace ? Math.PI / 8 : Math.PI / 1.2; 
                        if (Math.abs(relativeAngle) < fov) {
                            obstacleInFront = true;
                            (ac as any).cautionFactor = 0.85;
                            
                            // Persist avoidance direction for other AI cars
                            if (!(ac as any).avoidDir) (ac as any).avoidDir = relativeAngle > 0 ? -1 : 1;
                            const sideAngle = (ac as any).avoidDir * Math.PI/2;
                            const weightFactor = isRace ? 1.0 : 1.0;
                            const weight = ((sensorRange - dist) / sensorRange) * weightFactor;
                            avoidanceVector.x += Math.cos(ac.angle + sideAngle) * weight;
                            avoidanceVector.y += Math.sin(ac.angle + sideAngle) * weight;
                        }
                    }
                });

                // Detect Lot Boundaries
                const lotLimit = mode === 'parking' ? 1400 : (mode === 'race' ? 15000 : 5000);
                if (Math.abs(ac.x) > lotLimit || Math.abs(ac.y) > lotLimit) {
                    obstacleInFront = true;
                    avoidanceVector.x -= ac.x / lotLimit;
                    avoidanceVector.y -= ac.y / lotLimit;
                }

                // Detect Potholes and Obstacles
                gameState.current.obstacles.forEach(ob => {
                  const dx = ob.x - ac.x;
                  const dy = ob.y - ac.y;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  let sensorRange = 120;
                  if (ac.state === 'maneuvering') sensorRange = 50;

                  if (dist < sensorRange) {
                      const angleToOb = Math.atan2(dy, dx);
                      let relAngle = angleToOb - ac.angle;
                      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
                      while (relAngle < -Math.PI) relAngle += Math.PI * 2;
                      
                      if (Math.abs(relAngle) < 1.0) {
                          obstacleInFront = true;
                          const sideAngle = relAngle > 0 ? -Math.PI/2 : Math.PI/2;
                          avoidanceVector.x += Math.cos(ac.angle + sideAngle) * (sensorRange / (dist + 1));
                          avoidanceVector.y += Math.sin(ac.angle + sideAngle) * (sensorRange / (dist + 1));
                      }
                  }
                });
              }

              // 2. Navigation State Machine
              if (obstacleInFront && ac.state !== 'maneuvering' && ac.state !== 'parked') {
                  // Only enter avoiding state if the avoidance signal is strong enough to counter-act target
                  const strength = Math.sqrt(avoidanceVector.x**2 + avoidanceVector.y**2);
                  if (strength > 0.2) {
                    ac.state = 'avoiding';
                    ac.avoidAngle = Math.atan2(avoidanceVector.y, avoidanceVector.x);
                  }
              }

              if (ac.state === 'avoiding') {
                  let diff = (ac.avoidAngle || 0) - ac.angle;
                  while (diff < -Math.PI) diff += Math.PI * 2;
                  while (diff > Math.PI) diff -= Math.PI * 2;
                  
                  // Smoother steering to avoid 'tweaking'
                  ac.angle += diff * 0.08; 
                  ac.v = Math.max(ac.v * 0.96, 1.5); 
                  if (!obstacleInFront) {
                    ac.state = 'roaming';
                    (ac as any).avoidDir = 0; // Reset persistent avoidance direction
                  }
              } 
              else if (ac.state === 'searching') {
                  const spot = ac.targetSpot;
                  if (!spot) { ac.state = 'roaming'; return; }
                  
                  // Approach target: stop perpendicular to spot (like preparing to reverse in)
                  const approachOffset = 180;
                  const side = ac.x < spot.x ? -1 : 1;
                  const targetX = spot.x + Math.cos(spot.angle + Math.PI/2) * approachOffset + (Math.cos(spot.angle) * 20);
                  const targetY = spot.y + Math.sin(spot.angle + Math.PI/2) * approachOffset + (Math.sin(spot.angle) * 20);
                  
                  const tdx = targetX - ac.x;
                  const tdy = targetY - ac.y;
                  const tdist = Math.sqrt(tdx*tdx + tdy*tdy);

                  if (tdist < 40) {
                      ac.state = 'maneuvering';
                      ac.maneuverStep = 0;
                      ac.maneuverTimer = 40;
                      ac.v = 0;
                  } else {
                      const targetAngle = Math.atan2(tdy, tdx);
                      let angleDiff = targetAngle - ac.angle;
                      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                      ac.angle += angleDiff * 0.06;
                      // Dynamic speed based on distance and cornering
                      const speedLimitManual = Math.min(2.5, tdist / 60);
                      const corneringFactor = Math.max(0.3, 1 - Math.abs(angleDiff));
                      ac.v = Math.min(ac.v + 0.08, speedLimitManual * corneringFactor);
                  }
              }
              else if (ac.state === 'maneuvering') {
                  const spot = ac.targetSpot;
                  if (!spot) { ac.state = 'roaming'; return; }
                  
                  // Gap assessment: check if spot is blocked
                  const others = [car, ...gameState.current.aiCars.filter(o => o !== ac)];
                  const spotOccupied = others.some(o => {
                      const d = Math.sqrt((o.x - spot.x)**2 + (o.y - spot.y)**2);
                      return d < 40;
                  });

                  if (spotOccupied) {
                      ac.state = 'avoiding';
                      ac.avoidAngle = ac.angle + Math.PI; 
                      ac.targetSpot = null;
                      return;
                  }

                  const adx = spot.x - ac.x;
                  const ady = spot.y - ac.y;
                  const adist = Math.sqrt(adx*adx + ady*ady);
                  
                  ac.maneuverTimer = (ac.maneuverTimer || 0) - 1;
                  const step = ac.maneuverStep || 0;

                  if (step === 0) { // Prep
                      ac.v *= 0.8;
                      if (Math.abs(ac.v) < 0.1) {
                          ac.maneuverStep = 1;
                          ac.maneuverTimer = 40;
                      }
                  } else if (step === 1) { // Forward and Swing
                      const targetAngle = spot.angle + Math.PI/4; 
                      let diff = targetAngle - ac.angle;
                      while (diff > Math.PI) diff -= Math.PI * 2;
                      while (diff < -Math.PI) diff += Math.PI * 2;
                      ac.angle += diff * 0.08;
                      ac.v = 0.6;
                      if (ac.maneuverTimer <= 0) { ac.maneuverStep = 2; ac.maneuverTimer = 30; }
                  } else if (step === 2) { // Pause
                      ac.v *= 0.7;
                      if (Math.abs(ac.v) < 0.1 && ac.maneuverTimer <= 0) { ac.maneuverStep = 3; ac.maneuverTimer = 200; }
                  } else if (step === 3) { // Reverse in
                      const angleToSpot = Math.atan2(ady, adx);
                      let targetAngle = angleToSpot + Math.PI; 
                      let diff = targetAngle - ac.angle;
                      while (diff > Math.PI) diff -= Math.PI * 2;
                      while (diff < -Math.PI) diff += Math.PI * 2;
                      
                      ac.angle += diff * 0.1;
                      ac.v = -0.7;

                      if (adist < 15) {
                          ac.maneuverStep = 4;
                          ac.maneuverTimer = 60;
                      }
                  } else if (step === 4) { // Final Adjust
                      let diff = spot.angle - ac.angle;
                      while (diff > Math.PI) diff -= Math.PI * 2;
                      while (diff < -Math.PI) diff += Math.PI * 2;
                      ac.angle += diff * 0.15;
                      ac.v = adist > 5 ? -0.3 : 0;
                      
                      if (adist < 8 && Math.abs(diff) < 0.1) {
                          ac.state = 'parked';
                      }
                  } else {
                      ac.state = 'roaming';
                      ac.targetSpot = null;
                  }
              }
              else if (ac.state === 'parked') {
                  ac.v *= 0.8;
                  ac.maneuverTimer = (ac.maneuverTimer || 0) - 1;
                  if (ac.maneuverTimer <= 0) {
                      ac.state = 'roaming';
                      ac.targetSpot = null;
                  }
              }
              else {
              // Standard Roaming or Racing
              const isRace = !ac.path;
              const track = isRace ? gameState.current.track : ac.path;
              
              if (!track || track.length === 0) {
                  ac.v *= 0.9;
                  return;
              }

              // --- ADVANCED RACING AI ENGINE ---
              if (isRace) {
                  // 1. Look-ahead and Racing Line
                  if (ac.racingLineOffset === undefined) ac.racingLineOffset = (Math.random() - 0.5) * 60;
                  
                  const target = track[ac.targetIdx];
                  const nextTarget = track[(ac.targetIdx + 1) % track.length];
                  const lookAheadTarget = track[(ac.targetIdx + 2) % track.length];
                  const prevTarget = track[(ac.targetIdx - 1 + track.length) % track.length];

                  const dx = target.x - ac.x;
                  const dy = target.y - ac.y;
                  const distToTarget = Math.sqrt(dx*dx + dy*dy);
                  const segmentAngle = Math.atan2(target.y - prevTarget.y, target.x - prevTarget.x);

                  // Calculate turn severity at the CURRENT target to find the apex
                  const angleIn = segmentAngle;
                  const angleOut = Math.atan2(nextTarget.y - target.y, nextTarget.x - target.x);
                  let currentTurnSeverity = angleOut - angleIn;
                  while (currentTurnSeverity > Math.PI) currentTurnSeverity -= Math.PI * 2;
                  while (currentTurnSeverity < -Math.PI) currentTurnSeverity += Math.PI * 2;

                  const maxApex = TRACK_WIDTH * 0.4;
                  const apexTarget = Math.max(-maxApex, Math.min(maxApex, currentTurnSeverity * 200));
                  
                  if ((ac as any).currentOffset === undefined) (ac as any).currentOffset = ac.racingLineOffset || 0;
                  const laneTarget = (ac.racingLineOffset || 0) * (1 - Math.min(1, Math.abs(currentTurnSeverity) * 2));
                  const combinedTarget = apexTarget + laneTarget;
                  
                  (ac as any).currentOffset += (combinedTarget - (ac as any).currentOffset) * 0.1;
                  
                  const tx = target.x + Math.cos(segmentAngle + Math.PI/2) * (ac as any).currentOffset;
                  const ty = target.y + Math.sin(segmentAngle + Math.PI/2) * (ac as any).currentOffset;

                  const adx = tx - ac.x;
                  const ady = ty - ac.y;
                  const dist = Math.sqrt(adx*adx + ady*ady);

                  // Predictive Checkpoint Switching - Higher accuracy to force them through gates
                  const speedSensitivity = 40 + (Math.abs(ac.v) * 8);
                  if (dist < speedSensitivity) {
                      ac.targetIdx++;
                      if (ac.targetIdx >= track.length) {
                          ac.targetIdx = 0;
                          ac.laps++;
                          if (ac.laps >= gameState.current.maxLaps && !gameState.current.winner) {
                              gameState.current.winner = 'ai';
                              setPhase('crash');
                          }
                      }
                  }

                  // 2. Advanced Predictive Braking
                  const angleToNext = Math.atan2(nextTarget.y - target.y, nextTarget.x - target.x);
                  const angleAfterNext = Math.atan2(lookAheadTarget.y - nextTarget.y, lookAheadTarget.x - nextTarget.x);
                  let turnSeverity = angleAfterNext - angleToNext;
                  while (turnSeverity > Math.PI) turnSeverity -= Math.PI * 2;
                  while (turnSeverity < -Math.PI) turnSeverity += Math.PI * 2;
                  
                  const isSharpTurnAhead = Math.abs(turnSeverity) > 0.5;
                  ac.brakingZone = isSharpTurnAhead && (distToTarget < 500);

                  // 3. Dynamic Steering with Road Adherence
                  let finalTargetAngle = Math.atan2(ady, adx);
                  const distFromRoadCenter = Math.sqrt(adx*adx + ady*ady);
                  
                  // ROAD ADHERENCE: If too far from center, ignore obstacles and steer back
                  const maxDrift = TRACK_WIDTH * 0.4;
                  const isOffRoad = distFromRoadCenter > maxDrift;

                  if (isOffRoad) {
                    finalTargetAngle = Math.atan2(ady, adx); // Re-emphasize waypoint
                  } else if (obstacleInFront) {
                      const blendX = Math.cos(finalTargetAngle) + avoidanceVector.x * 1.5;
                      const blendY = Math.sin(finalTargetAngle) + avoidanceVector.y * 1.5;
                      finalTargetAngle = Math.atan2(blendY, blendX);
                  }

                  let angleDiff = finalTargetAngle - ac.angle;
                  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                  const diff = DIFFICULTY_CONFIG[gameState.current.difficulty || 'normal'];
                  // Turn speed scales with difficulty + velocity
                  const turnSpeed = (0.2 + (diff.turnSpeed * 0.6)) + Math.min(0.18, (Math.abs(ac.v) / 15));
                  ac.angle += angleDiff * turnSpeed;

                  // 4. Speed Management
                  const currentPhase = gameState.current.phase;
                  const isRaceMode = gameState.current.mode === 'race';
                  const canMove = !isRaceMode || currentPhase === 'race';
                  
                  // SPEED LINKED TO DIFFICULTY AND PLAYER MAX SPEED
                  const baseBotSpeed = theme.maxSpeedKmh / SPEED_UNIT;
                  const targetVBase = baseBotSpeed * diff.speedLimit;
                  const levelSpeedBoost = 1 + (gameState.current.level * 0.1);
                  const localTurnPenalty = Math.max(0.6, 1 - (Math.abs(angleDiff) * 0.4));
                  const brakingPenalty = ac.brakingZone ? 0.75 : 1.0;

                  // Increased by 20% and made dynamic relative to player speed
                  const playerSpeed = Math.abs(car.v);
                  const dynamicSpeedFactor = 1.0 + (playerSpeed / (targetVBase * 30)); // Subtle dynamic follow

                  let targetV = canMove ? (targetVBase * levelSpeedBoost * localTurnPenalty * brakingPenalty) * 1.05 * 1.05 * dynamicSpeedFactor : 0;
                  if (obstacleInFront && !isOffRoad) targetV *= ((ac as any).cautionFactor || 0.95);

                  const accelRate = ac.v < targetV ? (0.2 + diff.speedLimit * 0.1) : 0.5; 
                  ac.v += (targetV - ac.v) * accelRate;

              } else {
                  // --- ROAMING / PARKING TRAFFIC AI ---
                  const target = track[ac.targetIdx];
                  if (!target) return;

                  const adx = target.x - ac.x;
                  const ady = target.y - ac.y;
                  const dist = Math.sqrt(adx*adx + ady*ady);

                  if (dist < 100) {
                      ac.targetIdx++;
                      if (ac.targetIdx >= track.length) ac.targetIdx = 0;
                  }

                  const isStopped = (ac as any).stopTime > 0;
                  if (isStopped) {
                    (ac as any).stopTime--;
                    ac.v *= 0.85;
                  } else if (Math.random() < 0.001) {
                    (ac as any).stopTime = 60 + Math.random() * 100;
                  }

                  const targetAngle = Math.atan2(ady, adx);
                  let angleDiff = targetAngle - ac.angle;
                  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                  
                  ac.angle += angleDiff * 0.05;
                  
                  if (!isStopped) {
                    const targetV = 3.8;
                    ac.v += (targetV - ac.v) * 0.08;
                  } else if (Math.abs(ac.v) < 0.1) {
                    ac.v = 0;
                  }
              }
              }

              ac.x += Math.cos(ac.angle) * ac.v;
              ac.y += Math.sin(ac.angle) * ac.v;

              // AI Trailer Physics
              if (ac.trailer) {
                  const hitchX = ac.x - Math.cos(ac.angle) * 30; // Move hitch further back on cab
                  const hitchY = ac.y - Math.sin(ac.angle) * 30;
                  const dx = ac.trailer.x - hitchX;
                  const dy = ac.trailer.y - hitchY;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  const trailerHitchDist = 55; // Increase gap between truck and trailer
                  if (dist > 0) {
                      ac.trailer.x = hitchX + (dx / dist) * trailerHitchDist;
                      ac.trailer.y = hitchY + (dy / dist) * trailerHitchDist;
                      ac.trailer.angle = Math.atan2(hitchY - ac.trailer.y, hitchX - ac.trailer.x);
                  }
              }

              // Collision with user
              const cdx = ac.x - car.x;
              const cdy = ac.y - car.y;
              const collisionDist = mode === 'parking' ? 25 : 40;
              if (Math.sqrt(cdx*cdx + cdy*cdy) < collisionDist) {
                  // Only crash if not in menu and at significant relative velocity or during a race
                  const relativeV = Math.abs(ac.v - car.v);
                  if ((phase === 'race' && (relativeV > 2 || mode === 'race')) || (mode === 'parking' && Math.abs(car.v) > 0.5)) {
                    audio.current?.explosion();
                    gameState.current.health--;
                    if (gameState.current.health <= 0) {
                        setPhase('crash');
                    } else {
                        car.v = 0;
                    }
                  }
              }
          });    


      // Lap & Checkpoint Detection (Precise Physical Gate Crossing)
      if (mode === 'race' && currentPhase === 'race' && gameState.current.checkpoints.length > 0) {
        gameState.current.checkpoints.forEach((trackIdx, cpIndex) => {
            const nextCpIndex = (car.lastCheck + 1) % gameState.current.checkpoints.length;
            if (cpIndex !== nextCpIndex) return;

            const p = track[trackIdx];
            const nextNode = track[(trackIdx + 1) % track.length];
            const gateAngle = Math.atan2(nextNode.y - p.y, nextNode.x - p.x) + Math.PI/2;
            
            const dx = car.x - p.x;
            const dy = car.y - p.y;
            
            const cos = Math.cos(-gateAngle);
            const sin = Math.sin(-gateAngle);
            const lx = dx * cos - dy * sin;
            const ly = dx * sin + dy * cos;
            
            if (Math.abs(ly) < 30 && Math.abs(lx) > TRACK_WIDTH/2 - 5 && Math.abs(lx) < TRACK_WIDTH/2 + 25) {
                audio.current?.explosion();
                setPhase('crash');
                return;
            }

            if (Math.abs(lx) < TRACK_WIDTH/2 && Math.abs(ly) < 60) {
                audio.current?.beep(600 + (cpIndex * 10), 0.15); 
                
                if (cpIndex === 0 && car.lastCheck === gameState.current.checkpoints.length - 1) {
                  const currLaps = car.laps + 1;
                  car.laps = currLaps;
                  setLaps(currLaps);
                  
                  if (currLaps >= gameState.current.maxLaps) {
                    gameState.current.winner = 'player';
                    audio.current?.beep(660, 0.2);
                    setTimeout(() => audio.current?.beep(880, 0.2), 150);
                    setTimeout(() => audio.current?.beep(1320, 0.4), 300);
                    setPhase('crash');
                  }
                }
                
                if (cpIndex !== 0) {
                    car.v += 3.5;
                    gameState.current.particles.push({
                        x: car.x, y: car.y - 40, vx: 0, vy: -2, life: 1, color: '#39FF14', text: 'BOOST!'
                    });
                }
                
                car.lastCheck = cpIndex;
                gameState.current.missedLastGate = false;
                setLastCheck(cpIndex);
            } else if (ly < -60) {
                // If they bypassed the gate but are relatively close
                if (Math.sqrt(dx*dx + dy*dy) < TRACK_WIDTH * 2) {
                    gameState.current.missedLastGate = true;
                }
            }
        });
      }

      if (gameState.current.missedLastGate !== gameState.current.prevMissedLastGate) {
          setMissedAlert(gameState.current.missedLastGate);
          gameState.current.prevMissedLastGate = gameState.current.missedLastGate;
      }

      // Camera
      // Camera Shake (Intense on crash)
      const speedFactor = Math.abs(car.v) / (theme.maxSpeedKmh / SPEED_UNIT);
      const isCrashing = currentPhase === 'crash' && !gameState.current.winner;
      const shakeX = currentPhase === 'race' 
        ? (Math.random() - 0.5) * speedFactor * 2 
        : (isCrashing ? (Math.random() - 0.5) * 20 : 0);
      const shakeY = currentPhase === 'race' 
        ? (Math.random() - 0.5) * speedFactor * 2 
        : (isCrashing ? (Math.random() - 0.5) * 20 : 0);
      
      camera.x += (car.x - camera.x) * 0.1;
      camera.y += (car.y - camera.y) * 0.1;

      // Adjust scale for mode
      const targetScale = mode === 'parking' ? 1.4 : 1.0;
      const currentScale = 1.0; // We can use state but let's stick to simple CSS scale via canvas transform if needed or just zoomed camera logic.
      // Actually let's just use canvas scale 

      // Distance
      if (gameState.current.frame % 10 === 0) setDistance(d => d + Math.abs(car.v) * 0.1);
      gameState.current.frame++;

      // Collisions (Player and AI)
      for (const ob of obstacles) {
          // Player Collision
          const dx = car.x - ob.x;
          const dy = car.y - ob.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          const isSolid = ob.type === 'rock' || ob.type === 'building' || ob.type === 'tree';
          const collSize = ob.type === 'building' ? ob.size * 0.7 : (ob.size * 0.8 + 10);

          if (dist < collSize) {
              if (ob.type === 'pothole') {
                  const diffLevel = ['easy', 'normal', 'hard', 'impossible'].indexOf(difficulty);
                  const penalty = 0.5 - (diffLevel * 0.1);
                  car.v *= Math.max(0.1, penalty);
                  if (gameState.current.frame % 5 === 0) {
                      gameState.current.particles.push({
                          x: car.x, y: car.y, vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5, life: 1, color: '#2a1001'
                      });
                  }
              } else if (isSolid) {
                  audio.current?.explosion();
                  gameState.current.health--;
                  if (gameState.current.health <= 0) {
                      setPhase('crash');
                  } else {
                      car.v = 0;
                  }
              }
          }

          // AI Collision (Only during race phase)
          if (mode === 'race' && currentPhase === 'race') {
              aiCars.forEach(ai => {
                  const adx = ai.x - ob.x;
                  const ady = ai.y - ob.y;
                  const adist = Math.sqrt(adx*adx + ady*ady);
                  if (adist < ob.size + 15) {
                      if (ob.type === 'pothole') {
                          ai.v *= 0.5; // AI also slowed by potholes
                      } else if (isSolid) {
                          // AI simple bounce or minor slow
                          ai.v *= 0.8;
                          ai.angle += (Math.random() - 0.5) * 0.5;
                      }
                  }
              });
          }
      }

      // trailColor logic
      const isOffRoad = gameState.current.offRoad || mode === 'free';
      const landscapeColor = darkenColor(theme.ground, 30);
      const SMOKE_COLORS: Record<Biome, string> = {
          plains: 'rgba(150, 200, 150, 0.5)',
          winter: 'rgba(230, 230, 240, 0.6)',
          sand: 'rgba(255, 230, 150, 0.6)',
          muddy: 'rgba(100, 70, 40, 0.6)',
      };
      const biomeSmoke = SMOKE_COLORS[biome] || 'rgba(200,200,200,0.4)';
      const smokeColor = isOffRoad ? biomeSmoke : 'rgba(200,200,200,0.4)';
      const trailColor = isOffRoad ? landscapeColor : '#111';

      if (Math.abs(car.v) > 2 && (keys.a || keys.d)) {
          driftBuffer.current = 20; // Maintain skid for 20 frames after release
          const currentTime = gameState.current.frame;
          trails.push({ x: car.x, y: car.y, a: car.angle, opacity: 0.5, color: trailColor, time: currentTime });
          if (trails.length > 5000) trails.shift();
          // Add Smoke Particles
          for (let i = 0; i < 2; i++) {
              gameState.current.particles.push({
                  x: car.x - Math.cos(car.angle) * 15,
                  y: car.y - Math.sin(car.angle) * 15,
                  vx: (Math.random() - 0.5) * 2,
                  vy: (Math.random() - 0.5) * 2,
                  life: 1,
                  color: smokeColor
              });
          }
      } else if (driftBuffer.current > 0 && Math.abs(car.v) > 2) {
          driftBuffer.current--;
          const currentTime = gameState.current.frame;
          trails.push({ x: car.x, y: car.y, a: car.angle, opacity: 0.2 * (driftBuffer.current / 20), color: trailColor, time: currentTime });
      } else if (Math.abs(car.v) > 4) {
          // Subtle faint heat/speed lines even when not turning
          if (gameState.current.frame % 3 === 0) {
              const currentTime = gameState.current.frame;
              trails.push({ x: car.x, y: car.y, a: car.angle, opacity: 0.08, color: trailColor, time: currentTime });
          }
      }
      if (trails.length > 5000) trails.shift();

    gameState.current.particles = gameState.current.particles.filter(p => {
          p.x += p.vx; p.y += p.vy;
          p.life -= 0.02;
          return p.life > 0;
      });

      if (gameState.current.mode === 'horizon' && phase === 'race') {
          // Horizon mode uses iframe
      } else {
          // --- Existing Rendering logic ---
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Draw hearts
          ctx.fillStyle = '#ff0000';
          for (let i = 0; i < gameState.current.health; i++) {
              ctx.fillRect(20 + i * 40, 20, 30, 30);
          }
          ctx.fillStyle = theme.ground || '#2d5a27';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      const zoom = mode === 'parking' ? 1.3 : 1.0;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

      // --- Landscape Texture (Swirly Lines) ---
      ctx.strokeStyle = theme.grid; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.2;
      const swirlStep = 600;
      const swirlStartX = Math.floor((camera.x - canvas.width) / swirlStep) * swirlStep;
      const swirlStartY = Math.floor((camera.y - canvas.height) / swirlStep) * swirlStep;
      for (let x = swirlStartX - swirlStep; x < camera.x + canvas.width; x += swirlStep) {
          for (let y = swirlStartY - swirlStep; y < camera.y + canvas.height; y += swirlStep) {
              ctx.beginPath();
              const noise = ((x * 0.1) % 10 + (y * 0.1) % 10);
              ctx.arc(x + noise, y, 100 + noise * 5, 0, Math.PI * 1.5);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(x + 200, y + 200, 150 - noise * 2, Math.PI, Math.PI * 2.5);
              ctx.stroke();
          }
      }
      ctx.globalAlpha = 1;

      // Filter old marks and marks (5 seconds timeout)
      const currentFrameCount = gameState.current.frame;
      const MAX_AGE_FRAMES = 300; 
      gameState.current.skidMarks = gameState.current.skidMarks.filter(s => currentFrameCount - s.time < MAX_AGE_FRAMES);
      gameState.current.trails = gameState.current.trails.filter(t => (t.time && currentFrameCount - t.time < MAX_AGE_FRAMES) || !t.time);

      // Render landscape and skid marks
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      gameState.current.skidMarks.forEach(s => {
          const age = currentFrameCount - s.time;
          const fade = Math.pow(1 - (age / MAX_AGE_FRAMES), 1.5);
          ctx.globalAlpha = fade * 0.7;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 5 * fade;
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // 0. Trails (Drift Marks)
      const isMotorcycle_val = selectedVehicle === 'motorcycle';
      trails.forEach(t => {
          const age = t.time ? currentFrameCount - t.time : 0;
          const fade = t.time ? (1 - (age / MAX_AGE_FRAMES)) : 1;
          const trailOpacity = t.opacity * fade;
          ctx.globalAlpha = trailOpacity;
          
          ctx.save();
          ctx.translate(t.x, t.y);
          ctx.rotate(t.a);
          
          // Cool blurry trail effect: multiple stacked rects for "soft" edges
          const color = t.color || '#111';
          const widthMult = 1.0 + (1 - fade) * 0.8;
          
          if (isMotorcycle_val) {
              // Outer Blur
              ctx.fillStyle = color;
              ctx.globalAlpha = trailOpacity * 0.3;
              ctx.fillRect(-16 * widthMult, -5, 32 * widthMult, 10);
              // Inner Core
              ctx.globalAlpha = trailOpacity;
              ctx.fillRect(-15 * widthMult, -2, 30 * widthMult, 4);
          } else {
              // Outer Blur for both tires
              ctx.fillStyle = color;
              ctx.globalAlpha = trailOpacity * 0.3;
              ctx.fillRect(-16 * widthMult, -16, 32 * widthMult, 12);
              ctx.fillRect(-16 * widthMult, 8, 32 * widthMult, 12);
              // Inner Core
              ctx.globalAlpha = trailOpacity;
              ctx.fillRect(-15 * widthMult, -14, 30 * widthMult, 8);
              ctx.fillRect(-15 * widthMult, 10, 30 * widthMult, 8);
          }
          ctx.restore();
      });
      ctx.globalAlpha = 1;

      // Grid for Free Mode
      if (mode === 'free') {
          ctx.strokeStyle = theme.grid; ctx.lineWidth = 1;
          const g = 100;
          const ox = -camera.x % g; const oy = -camera.y % g;
          for (let x = ox - g; x < canvas.width + g; x += g) { ctx.beginPath(); ctx.moveTo(x + camera.x - canvas.width/2, -5000); ctx.lineTo(x + camera.x - canvas.width/2, 5000); ctx.stroke(); }
          for (let y = oy - g; y < canvas.height + g; y += g) { ctx.beginPath(); ctx.moveTo(-5000, y + camera.y - canvas.height/2); ctx.lineTo(5000, y + camera.y - canvas.height/2); ctx.stroke(); }
      }

      // Track Road
      if (mode === 'race') {
        // Grainy Texture for asphalt
        ctx.fillStyle = '#222';
        ctx.strokeStyle = '#fff'; ctx.lineWidth = TRACK_WIDTH + 20;
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath(); track.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
        
        // Red Curbs (Sketchy/Dashed)
        ctx.strokeStyle = '#f00'; ctx.lineWidth = TRACK_WIDTH + 20;
        ctx.setLineDash([30, 50]); ctx.stroke(); ctx.setLineDash([]);

        // Asphalt
        ctx.strokeStyle = '#222'; ctx.lineWidth = TRACK_WIDTH;
        ctx.beginPath(); track.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();

        // White border lines 
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = TRACK_WIDTH + 10;
        ctx.setLineDash([50, 50]); ctx.stroke(); ctx.setLineDash([]);

        // Center Line
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 3; ctx.setLineDash([40, 40]); ctx.stroke(); ctx.setLineDash([]);

        // Force Path Line
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.15)';
        ctx.lineWidth = 12;
        ctx.setLineDash([20, 30]);
        ctx.beginPath();
        track.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Finish Line
        const p1 = track[0]; const p2 = track[1];
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI/2;
        ctx.save(); ctx.translate(p1.x, p1.y); ctx.rotate(angle);
        ctx.fillStyle = '#fff'; ctx.fillRect(-TRACK_WIDTH/2, -10, TRACK_WIDTH, 20);
        ctx.fillStyle = '#000'; for(let i=0; i<TRACK_WIDTH/10; i+=2) ctx.fillRect(-TRACK_WIDTH/2 + i*10, -10, 10, 10);
        ctx.restore();

        // Checkpoint Gates
        track.forEach((p, i) => {
            if (i === 0) return; // Skip finish
            
            const isCheckpointGate = gameState.current.checkpoints.includes(i);
            if (!isCheckpointGate) return;
            
            ctx.save();
            ctx.translate(p.x, p.y);
            const next = track[(i + 1) % track.length];
            if (next) {
                ctx.rotate(Math.atan2(next.y - p.y, next.x - p.x) + Math.PI/2);
                
                const cpIndex = gameState.current.checkpoints.indexOf(i);
                const isNext = cpIndex === ((car.lastCheck + 1) % gameState.current.checkpoints.length);
                const passed = car.lastCheck >= cpIndex || (car.lastCheck === 0 && cpIndex === gameState.current.checkpoints.length - 1);
                
                if (isNext) {
                    // Bright neon arch
                    ctx.beginPath();
                    ctx.strokeStyle = '#39FF14';
                    ctx.lineWidth = 8;
                    ctx.setLineDash([10, 5]);
                    ctx.ellipse(0, 0, TRACK_WIDTH/2, 100, 0, Math.PI, 0);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = 'rgba(57, 255, 20, 0.4)';
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = '#39FF14';
                    ctx.fillRect(-TRACK_WIDTH/2, -15, TRACK_WIDTH, 30);
                    ctx.shadowBlur = 0;
                    
                    // Floating Arrow above next gate
                    ctx.save();
                    ctx.translate(0, -120); // Higher up due to arch
                    const bounce = Math.sin(gameState.current.frame * 0.12) * 15;
                    ctx.fillStyle = '#39FF14';
                    ctx.beginPath();
                    ctx.moveTo(-20, bounce);
                    ctx.lineTo(20, bounce);
                    ctx.lineTo(0, bounce + 30);
                    ctx.fill();
                    ctx.restore();

                    // "CHECKPOINT" Text
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 24px Inter';
                    ctx.textAlign = 'center';
                    ctx.fillText("CHECKPOINT", 0, -160 + Math.sin(gameState.current.frame * 0.1) * 5);
                } else {
                    ctx.fillStyle = passed ? 'rgba(57,255,20,0.2)' : 'rgba(255,255,255,0.1)';
                    ctx.fillRect(-TRACK_WIDTH/2, -5, TRACK_WIDTH, 10);
                }
                
                // Detailed Pillars
                ctx.fillStyle = '#444';
                ctx.fillRect(-TRACK_WIDTH/2 - 15, -20, 15, 40);
                ctx.fillRect(TRACK_WIDTH/2, -20, 15, 40);
                
                // Pillar Tops (Red Lights)
                ctx.fillStyle = isNext ? '#39FF14' : '#f33';
                ctx.beginPath();
                ctx.arc(-TRACK_WIDTH/2 - 7.5, -20, 8, 0, Math.PI*2);
                ctx.arc(TRACK_WIDTH/2 + 7.5, -20, 8, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        });
      }

      // Parking Lot Visuals
      if (mode === 'parking') {
        const rows = 2;
        const cols = 12;
        const spacingX = 120;
        const spacingY = 340;
        const lotWidth = cols * spacingX + 800;
        const lotHeight = rows * spacingY + 800;

        // Asphalt Base
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-lotWidth/2, -lotHeight/2, lotWidth, lotHeight);

        // Aisle Road Markings (Central lines)
        ctx.strokeStyle = '#f8d500'; // Double yellow lines
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-lotWidth/2, -5); ctx.lineTo(lotWidth/2, -5);
        ctx.moveTo(-lotWidth/2, 5); ctx.lineTo(lotWidth/2, 5);
        ctx.stroke();

        // White Lane dividers for the aisle
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(-lotWidth/2, -80); ctx.lineTo(lotWidth/2, -80);
        ctx.moveTo(-lotWidth/2, 80); ctx.lineTo(lotWidth/2, 80);
        ctx.stroke();
        ctx.setLineDash([]);

        // Directional Arrows on Road
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let x = -lotWidth/2 + 400; x < lotWidth/2; x += 800) {
            // Arrow Right in top lane
            ctx.save(); ctx.translate(x, -40); ctx.beginPath();
            ctx.moveTo(-30, -10); ctx.lineTo(10, -10); ctx.lineTo(10, -20); ctx.lineTo(40, 0); ctx.lineTo(10, 20); ctx.lineTo(10, 10); ctx.lineTo(-30, 10); ctx.fill();
            ctx.restore();
            // Arrow Left in bottom lane
            ctx.save(); ctx.translate(x + 200, 40); ctx.rotate(Math.PI); ctx.beginPath();
            ctx.moveTo(-30, -10); ctx.lineTo(10, -10); ctx.lineTo(10, -20); ctx.lineTo(40, 0); ctx.lineTo(10, 20); ctx.lineTo(10, 10); ctx.lineTo(-30, 10); ctx.fill();
            ctx.restore();
        }

        // Unified Parking Grid (Thick Shared Lines)
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 10;
        for (let r = 0; r < rows; r++) {
            const rowY = (r - (rows - 1) / 2) * spacingY;
            const h = 120; // Spot length
            const totalWidth = cols * spacingX;
            const startX = -totalWidth / 2;
            
            // Draw horizontal boundaries
            ctx.beginPath();
            ctx.moveTo(startX, rowY - h/2); ctx.lineTo(startX + totalWidth, rowY - h/2);
            ctx.moveTo(startX, rowY + h/2); ctx.lineTo(startX + totalWidth, rowY + h/2);
            
            // Draw all vertical vertical separators
            for (let c = 0; c <= cols; c++) {
                const x = startX + c * spacingX;
                ctx.moveTo(x, rowY - h/2);
                ctx.lineTo(x, rowY + h/2);
            }
            ctx.stroke();
            
            // Subtle fill
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(startX, rowY - h/2, totalWidth, h);
        }

        // Space markings / Icons
        ctx.font = 'bold 30px Inter';
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.textAlign = 'center';
        for (let c = 0; c < cols; c+=3) {
            const x = (c - (cols - 1) / 2) * spacingX;
            ctx.fillText("SLOW", x, -150);
            ctx.fillText("SLOW", x, 150);
        }

        // Green Islands / Curbs with Red/White Stripes
        ctx.fillStyle = '#2D5A27';
        ctx.fillRect(-lotWidth/2, -lotHeight/2, lotWidth, 100);
        ctx.fillRect(-lotWidth/2, lotHeight/2 - 100, lotWidth, 100);
        
        // Striped Curbs
        const stripeWidth = 40;
        for (let x = -lotWidth/2; x < lotWidth/2; x += stripeWidth * 2) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(x, -lotHeight/2 + 90, stripeWidth, 10);
            ctx.fillRect(x, lotHeight/2 - 100, stripeWidth, 10);
            ctx.fillStyle = '#f33';
            ctx.fillRect(x + stripeWidth, -lotHeight/2 + 90, stripeWidth, 10);
            ctx.fillRect(x + stripeWidth, lotHeight/2 - 100, stripeWidth, 10);
        }

        // Lamps/Poles (Visual only)
        ctx.fillStyle = '#555';
        for (let c = 0; c < cols; c+=2) {
             const x = (c - (cols - 1) / 2) * spacingX;
             ctx.fillRect(x - 4, -lotHeight/2 + 20, 8, 8);
             ctx.fillRect(x - 5, lotHeight/2 - 30, 10, 10);
        }

          gameState.current.parkingSpots.forEach((spot, i) => {
                const isActive = i === gameState.current.currentParkingSpotIdx;
                
                if (isActive) {
                    ctx.save();
                    ctx.translate(spot.x, spot.y);
                    ctx.rotate(spot.angle);

                    // Neon Highlight (Slightly smaller than the spot to not overlap white lines)
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#39FF14';
                    ctx.strokeStyle = '#39FF14';
                    ctx.lineWidth = 14; 
                    ctx.fillStyle = 'rgba(57,255,20,0.15)';
                    ctx.fillRect(-spot.width/2 + 7, -spot.height/2 + 7, spot.width - 14, spot.height - 14);
                    ctx.strokeRect(-spot.width/2 + 7, -spot.height/2 + 7, spot.width - 14, spot.height - 14);
                    ctx.shadowBlur = 0;
                    
                    // Guide lines (Curves)
                    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                    ctx.lineWidth = 4;
                    ctx.setLineDash([8, 8]);
                    ctx.beginPath();
                    ctx.arc(-spot.width/2 - 40, 0, 80, 0, Math.PI, true);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Directional Indicator Arrow (VERTICAL pointing INTO the spot)
                    const isTopRow = spot.y < 0;
                    const arrowDir = isTopRow ? -1 : 1; 
                    
                    ctx.save();
                    // Spot is rotated 90deg, so Local X is Page Vertical.
                    // Tip points towards the curb (along local X)
                    const tipX = arrowDir * 40;

                    ctx.fillStyle = '#39FF14';
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = '#39FF14';
                    
                    ctx.beginPath();
                    ctx.moveTo(tipX, 0);                 // Tip at global Y end
                    ctx.lineTo(tipX - arrowDir*25, -18); // Wing
                    ctx.lineTo(tipX - arrowDir*25, 18);  // Wing
                    ctx.closePath();
                    ctx.fill();
                    // Shaft
                    ctx.fillRect(tipX - arrowDir*55, -6, 55, 12); 
                    ctx.restore();

                    // Horizontal Label (Near the curb) rotate 90deg back
                    ctx.save();
                    ctx.rotate(-Math.PI/2);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 16px Inter';
                    ctx.textAlign = 'center';
                    const labelY = isTopRow ? -spot.width/2 - 25 : spot.width/2 + 35;
                    ctx.fillText("PARK FRONT HERE", 0, labelY);
                    ctx.restore();
                    
                    // Number Label
                    ctx.font = 'black 32px Inter';
                    ctx.fillStyle = '#39FF14';
                    const numberY = isTopRow ? 55 : -55;
                    ctx.fillText(`${i + 1}`, 0, numberY);
                    
                    ctx.restore();
                }
            });
        }

      obstacles.forEach(ob => {
          if (Math.abs(ob.x - camera.x) > canvas.width || Math.abs(ob.y - camera.y) > canvas.height) return;
          ctx.fillStyle = theme.obstacleColors[ob.type];
          ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
          ctx.beginPath();
          if (ob.type === 'cone') { 
              ctx.moveTo(ob.x, ob.y - ob.size); 
              ctx.lineTo(ob.x - ob.size/2, ob.y + ob.size/2); 
              ctx.lineTo(ob.x + ob.size/2, ob.y + ob.size/2); 
              ctx.fill(); ctx.stroke();
          }
          else if (ob.type === 'pothole') {
              // Better Mud Visuals: Layered ellipses with transparency
              ctx.fillStyle = theme.obstacleColors.pothole || 'rgba(0,0,0,0.5)';
              ctx.ellipse(ob.x, ob.y, ob.size, ob.size * 0.6, 0, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.fillStyle = 'rgba(0,0,0,0.2)';
              ctx.beginPath();
              ctx.ellipse(ob.x + 5, ob.y + 5, ob.size * 0.8, ob.size * 0.5, 0.2, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.ellipse(ob.x, ob.y, ob.size, ob.size * 0.6, 0, 0, Math.PI * 2);
              ctx.stroke();
          }
          else if (ob.type === 'road') {
              ctx.fillStyle = ob.color || 'rgba(50,50,50,0.1)';
              ctx.fillRect(ob.x - ob.size/2, ob.y - ob.size/2, ob.size, ob.size);
          }
          else if (mode === 'parking' && ob.type === 'rock') {
              // In parking mode, render 'rock' obstacles as varied parked cars
              const vType = ob.vType || 'coupe';
              const color = ob.color || '#555';
              const angle = ob.angle || 0;
              
              drawCar({ x: ob.x, y: ob.y, angle: angle, v: 0 }, color, ctx, theme, { a: false, d: false, p: false }, vType);
          }
          else if (ob.type === 'building') {
              ctx.save();
              ctx.translate(ob.x, ob.y);
              ctx.rotate(ob.angle || 0);
              
              const h = ob.size;
              const w = ob.size * 0.7;
              
              // Shadow casting
              ctx.fillStyle = 'rgba(0,0,0,0.4)';
              ctx.beginPath();
              ctx.moveTo(-w/2, -h/2);
              ctx.lineTo(-w/2 - 50, -h/2 + 50);
              ctx.lineTo(w/2 - 50, h/2 + 50);
              ctx.lineTo(w/2, h/2);
              ctx.fill();
              
              // Building roof
              ctx.fillStyle = ob.color || '#333';
              ctx.fillRect(-w/2, -h/2, w, h);
              
              // Roof border
              ctx.strokeStyle = '#111';
              ctx.lineWidth = 4;
              ctx.strokeRect(-w/2, -h/2, w, h);
              
              // Roof details (AC vents, etc)
              ctx.fillStyle = '#111';
              ctx.fillRect(-w/4, -h/4, w/4, w/4);
              if (w > 100) ctx.fillRect(10, 10, 20, 20);
              
              ctx.restore();
          }
          else { 
              ctx.arc(ob.x, ob.y, ob.size, 0, Math.PI * 2); 
              ctx.fill(); ctx.stroke();
          }
      });

      // Particles & Text Feedback
      gameState.current.particles.forEach(p => {
          ctx.globalAlpha = p.life;
          if (p.text) {
              ctx.fillStyle = p.color;
              ctx.font = `black ${20 + p.life * 15}px Inter`;
              ctx.textAlign = 'center';
              ctx.fillText(p.text, p.x, p.y);
          } else {
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5 + (1 - p.life) * 20, 0, Math.PI * 2);
              ctx.fill();
          }
          ctx.globalAlpha = 1;
      });

        // Draw Roaming AI cars in parking mode
        if (mode === 'parking' || mode === 'race') {
            gameState.current.aiCars.forEach(ac => {
                if (VEHICLE_CONFIGS[ac.type].hasTrailer && ac.trailer) {
                    drawCar(ac, ac.color, ctx, theme, { a: false, d: false }, ac.type, true);
                }
                drawCar(ac, ac.color, ctx, theme, { a: false, d: false }, ac.type);
            });
        }

      if (VEHICLE_CONFIGS[selectedVehicle].hasTrailer) {
          drawCar(car, carColor, ctx, theme, keys, selectedVehicle, true);
      }
      drawCar(car, carColor, ctx, theme, keys, selectedVehicle);

      ctx.restore();

      // --- Minimap ---
      if (mode === 'race') {
        const ms = 150;
        const mp = 20;
        ctx.save();
        ctx.translate(canvas.width - ms - mp, mp);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // @ts-ignore
        if (ctx.roundRect) ctx.roundRect(0, 0, ms, ms, 10); else ctx.rect(0, 0, ms, ms);
        ctx.fill();
        ctx.stroke();

        // Scale track to minimap
        const pad = 20;
        const drawW = ms - pad*2;
        const drawH = ms - pad*2;
        
        // Find bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        track.forEach(p => {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        const tW = maxX - minX || 1; const tH = maxY - minY || 1;
        const scale = Math.min(drawW / tW, drawH / tH);
        
        const toMap = (x: number, y: number) => ({
          x: pad + (x - minX) * scale,
          y: pad + (y - minY) * scale
        });

        // Draw Path
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        track.forEach((p, i) => {
          const m = toMap(p.x, p.y);
          if (i === 0) ctx.moveTo(m.x, m.y); else ctx.lineTo(m.x, m.y);
        });
        ctx.closePath();
        ctx.stroke();

        // Draw Finish
        if (track.length > 0) {
            const startPos = toMap(track[0].x, track[0].y);
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(startPos.x, startPos.y, 4, 0, Math.PI*2); ctx.fill();
        }

        // Draw Player
        const cp = toMap(car.x, car.y);
        ctx.fillStyle = theme.carColor;
        ctx.beginPath(); ctx.arc(cp.x, cp.y, 5, 0, Math.PI*2); ctx.fill();
        
        // Draw AIs
        gameState.current.aiCars.forEach(ac => {
            const ap = toMap(ac.x, ac.y);
            ctx.fillStyle = ac.color || theme.aiColor;
            ctx.beginPath(); ctx.arc(ap.x, ap.y, 4, 0, Math.PI*2); ctx.fill();
        });

        ctx.restore();
      }

      // PARKED OVERLAY
      if (gameState.current.showParkedText > 0) {
          gameState.current.showParkedText--;
          ctx.save();
          ctx.resetTransform();
          ctx.fillStyle = `rgba(57, 255, 20, ${Math.min(1, gameState.current.showParkedText / 30)})`;
          ctx.font = 'black 120px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowBlur = 40;
          ctx.shadowColor = '#39FF14';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 15;
          ctx.strokeText("PARKED", canvas.width / 2, canvas.height / 2);
          ctx.fillText("PARKED", canvas.width / 2, canvas.height / 2);
          ctx.restore();
      }

      }
      
    };

    let lastTime = 0;
    let accumulator = 0;
    const TIME_STEP = 1000 / 60; // 60 FPS Fixed loop

    const loop = (time: number) => {
        if (!lastTime) lastTime = time;
        let dt = time - lastTime;
        if (dt > 100) dt = 100;
        lastTime = time;
        accumulator += dt;

        while (accumulator >= TIME_STEP) {
            update();
            accumulator -= TIME_STEP;
        }
        
        animationFrameId = requestAnimationFrame(loop);
    };

    const handleResize = () => { 
        if (!canvas) return;
        canvas.width = window.innerWidth || 800; 
        canvas.height = window.innerHeight || 600; 
    };
    window.addEventListener('resize', handleResize); 
    handleResize(); 
    update(); // force initial render
    animationFrameId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animationFrameId); window.removeEventListener('resize', handleResize); };
  }, [phase, biome, mode, selectedVehicle]);

  useEffect(() => {
    if (audio.current) {
      audio.current.setMenuMusic(phase === 'menu' || phase === 'difficulty');
      if (phase === 'menu') {
        audio.current.setSpeed(0, selectedVehicle);
      }
    }
  }, [phase, selectedVehicle]);

  return (
    <div 
      className="relative w-full h-screen bg-[#1a1a1a] overflow-hidden font-vibrant text-white selection:bg-hot-pink/30 text-selection-none"
      onClick={() => { 
        if (!audio.current) {
          audio.current = createAudio();
          if (audio.current) {
            audio.current.setMenuMusic(phase === 'menu' || phase === 'difficulty');
            if (phase === 'menu') audio.current.setSpeed(0, selectedVehicle);
          }
        }
      }}
    >
      <canvas ref={canvasRef} className={`absolute inset-0 block touch-none ${mode === 'horizon' ? 'hidden' : ''}`} />
      
      {mode === 'horizon' && phase === 'race' && (
        <iframe 
          ref={iframeRef}
          src={`/littlejs/index.html?car=${selectedVehicle === 'truck' || selectedVehicle === 'semi' ? 1 : 0}`} 
          className="absolute inset-0 w-full h-full border-none z-[100]"
          title="LittleJS MICRO Racer"
        />
      )}
      
      {/* Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none z-[200] opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      {/* Countdown UI */}
      <AnimatePresence>
        {phase === 'countdown' && (
          <motion.div 
            initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
            animate={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-none backdrop-blur-sm"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 3, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.2, opacity: 0, rotate: 20 }}
              className="text-white font-black italic select-none"
            >
              <span className="text-[240px] drop-shadow-[20px_20px_0_#FF007F] leading-none">
                {countdown > 0 ? countdown : 'GO!'}
              </span>
            </motion.div>
          </motion.div>
        )}

        {/* Missed Checkpoint Warning */}
        {showLevelComplete && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-[110] bg-black/60 pointer-events-none"
            >
                <h2 className="text-6xl font-black italic text-neon-green tracking-tighter shadow-[0_0_20px_#39FF14]">LEVEL COMPLETED !!</h2>
            </motion.div>
        )}
        
        {mode === 'race' && phase === 'race' && missedAlert && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none w-full z-40">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-600/90 text-white px-8 py-4 rounded-xl border-4 border-black shadow-[10px_10px_0_0_#000] inline-block"
            >
              <h2 className="text-3xl font-black italic mb-2 tracking-tighter">CHECKPOINT MISSED!</h2>
              <p className="text-xl font-bold font-vibrant">Press <span className="bg-white text-black px-3 py-1 rounded mx-1">SPACE</span> to return to track</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HUD Controls */}
      {phase === 'race' && mode !== 'horizon' && (
        <div className="absolute top-10 left-10 flex flex-col gap-4 pointer-events-none">
          {mode === 'parking' && (
            <div className="bg-neon-green text-black px-6 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0_0_#000]">
                <span className="text-[10px] font-black uppercase tracking-widest block mb-1">CURRENT LEVEL</span>
                <span className="text-3xl font-black">{gameState.current.level}</span>
            </div>
          )}
          <div className="bg-electric-blue text-black px-6 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0_0_#000]"><span className="text-[10px] font-black uppercase tracking-widest block mb-1">SCORE</span><span className="text-3xl font-black">{Math.floor(distance)}m</span></div>
          <div className="bg-sun-yellow text-black px-6 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0_0_#000]"><span className="text-[10px] font-black uppercase tracking-widest block mb-1">MODE</span><span className="text-xl font-black uppercase text-center w-full">{mode === 'race' ? `${difficulty} race` : mode}</span></div>
          {mode === 'parking' && (
            <div className="bg-white text-black px-6 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0_0_#000]">
                <span className="text-[10px] font-black uppercase tracking-widest block mb-1">SPOT</span>
                <span className="text-2xl font-black uppercase">{gameState.current.currentParkingSpotIdx + 1} / {gameState.current.parkingSpots.length}</span>
            </div>
          )}
          {mode === 'race' && (
             <>
               <div className="bg-white text-black px-6 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0_0_#000]">
                 <span className="text-[10px] font-black uppercase tracking-widest block mb-1">LAP</span>
                 <span className="text-2xl font-black uppercase">{Math.min(laps + 1, gameState.current.maxLaps)} / {gameState.current.maxLaps}</span>
               </div>
               <div className="bg-hot-pink text-white px-6 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0_0_#000]">
                 <span className="text-[10px] font-black uppercase tracking-widest block mb-1">NEXT GATE</span>
                 <span className="text-2xl font-black uppercase">
                     {(() => {
                         const maxCheckpoints = gameState.current.checkpoints.length || 5;
                         const nextDisplayIndex = ((lastCheck + 1) % maxCheckpoints) || maxCheckpoints;
                         return `${nextDisplayIndex} / ${maxCheckpoints}`;
                     })()}
                 </span>
               </div>
             </>
          )}
        </div>
      )}

       {/* Speedometer Revamp */}
      {phase === 'race' && mode !== 'horizon' && (
        <div className="absolute bottom-10 left-10 flex flex-col items-center gap-4">
          <div className="relative w-52 h-52 flex items-center justify-center">
            {/* Speed Dial SVG */}
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {/* Outer Ring */}
              <circle cx="50" cy="50" r="45" fill="none" stroke="black" strokeWidth="10" strokeOpacity="0.8" />
              {/* Progress Arc */}
              <circle 
                cx="50" cy="50" r="45" fill="none" 
                stroke="#39FF14" strokeWidth="4" 
                strokeDasharray="282.7" 
                strokeDashoffset={282.7 - (Math.min(1, Math.abs(gameState.current.car.v * SPEED_UNIT) / 200) * 282.7)}
                className="transition-all duration-300 ease-out"
                strokeLinecap="round"
                filter="drop-shadow(0 0 4px #39FF14)"
              />
              {/* Ticks */}
              {[...Array(11)].map((_, i) => {
                const angle = (i * 22.5) * (Math.PI / 180);
                return (
                  <line 
                    key={i}
                    x1={50 + Math.cos(angle) * 38} 
                    y1={50 + Math.sin(angle) * 38} 
                    x2={50 + Math.cos(angle) * 42} 
                    y2={50 + Math.sin(angle) * 42} 
                    stroke={i > 8 ? "#FF007F" : "white"} 
                    strokeWidth="1" 
                    strokeOpacity="0.5"
                  />
                );
              })}
            </svg>

            {/* Hub Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="flex flex-col items-center justify-center bg-black/60 w-36 h-36 rounded-full border-2 border-white/10 backdrop-blur-md shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]">
                <span className="text-5xl font-black text-white italic tracking-tighter leading-none">
                  {Math.round(Math.abs(gameState.current.car.v * SPEED_UNIT))}
                </span>
                <span className="text-[10px] font-black text-white/40 tracking-[0.3em] mt-1">KM/H</span>
                
                {/* Secondary Indicators with flickering 'vibe' */}
                <div className="flex gap-2 mt-3">
                  <div className={`px-1.5 py-0.5 rounded-sm font-black text-[8px] transition-all duration-75 ${gameState.current.absActive || (Math.random() < 0.05 && gameState.current.frame % 30 < 5) ? (Math.random() > 0.2 ? 'bg-red-600 text-white shadow-[0_0_10px_#f00]' : 'bg-red-900 text-white/50') : 'bg-black/40 text-white/20 border border-white/5'}`}>ABS</div>
                  <div className={`px-1.5 py-0.5 rounded-sm font-black text-[8px] transition-all duration-75 ${gameState.current.tcsActive || (Math.random() < 0.03 && gameState.current.frame % 45 < 4) ? (Math.random() > 0.2 ? 'bg-orange-600 text-white shadow-[0_0_10px_#f80]' : 'bg-orange-900 text-white/50') : 'bg-black/40 text-white/20 border border-white/5'}`}>TCS</div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] transition-all duration-150 ${(Math.abs(gameState.current.car.v * 6.0) < 5 && gameState.current.keys.p) || gameState.current.keys.p ? 'bg-red-600 text-white shadow-[0_0_15px_#f00] scale-110 border-2 border-white' : 'bg-black/40 text-white/20 border border-white/5'}`}>P</div>
                </div>
              </div>

              {/* Digital Dash Accent Lines */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1 h-2 bg-neon-green rounded-full shadow-[0_0_10px_#39FF14]" />
            </div>
          </div>
        </div>
      )}

      {/* Driving Hint */}
      {phase === 'race' && mode !== 'horizon' && (
        <div className="absolute bottom-10 inset-x-0 flex justify-center pointer-events-none">
          <div className="bg-white text-black px-8 py-4 rounded-full border-4 border-black shadow-[8px_8px_0_0_#FF007F] font-black text-sm uppercase flex items-center gap-6">
            <span>WASD TO DRIVE</span>
            <div className="w-px h-6 bg-black/20" />
            <span>SPACE TO RESPAWN</span>
            <div className="w-px h-6 bg-black/20" />
            <span className="text-hot-pink">ESC FOR MENU</span>
          </div>
        </div>
      )}

      {/* Click To Play Screen */}
      <AnimatePresence>
        {!hasStarted && (
          <motion.div 
            key="start-screen"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0, scale: 1.5, filter: "blur(20px)" }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black z-[100] overflow-hidden"
          >
            <motion.div 
              initial={{ scale: 3, opacity: 0, y: -200, skewX: -20, rotateX: 90 }}
              animate={{ scale: 1, opacity: 1, y: 0, skewX: 0, rotateX: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 1.2, delay: 0.2 }}
            >
              <motion.div animate={{ rotate: [-2, 2, -2], y: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
                <h1 className="text-[70px] md:text-[120px] lg:text-[160px] font-black tracking-tighter text-white drop-shadow-[8px_8px_0_#FF007F] md:drop-shadow-[12px_12px_0_#FF007F] italic leading-[0.85] uppercase whitespace-nowrap">
                  MICRO RACER
                </h1>
                <p className="text-neon-green font-black uppercase tracking-[0.4em] text-[10px] md:text-sm mt-8 border-t border-b border-neon-green/20 py-2 text-center">High Performance • Low Poly • Drift King</p>
              </motion.div>
            </motion.div>
            
            <motion.button 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.5 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (!audio.current) {
                  audio.current = createAudio();
                  if (audio.current) {
                    audio.current.setMenuMusic(phase === 'menu' || phase === 'difficulty');
                    if (phase === 'menu') audio.current.setSpeed(0, selectedVehicle);
                  }
                }
                audio.current?.engineStart();
                setHasStarted(true);
              }}
              className="mt-24 px-12 py-6 bg-hot-pink hover:bg-neon-green text-black font-black text-2xl md:text-4xl rounded-[2rem] transform transition-colors shadow-[8px_8px_0_0_#FFF] uppercase tracking-widest border-4 border-black"
            >
              Click to Play
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Menu */}
      <AnimatePresence>
        {phase === 'menu' && hasStarted && (
          <motion.div 
            key="main-menu"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/95 z-50 overflow-y-auto pt-24 pb-8"
          >

            <div className="max-w-xl w-full text-center space-y-8 p-8 flex flex-col items-center">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0, y: -50 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
              >
                <motion.div animate={{ rotate: [0, -1, 1, 0] }} transition={{ repeat: Infinity, duration: 4 }}>
                  <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
                  <h1 className="text-[70px] md:text-[120px] lg:text-[160px] font-black tracking-tighter text-white drop-shadow-[8px_8px_0_#FF007F] md:drop-shadow-[12px_12px_0_#FF007F] italic leading-[0.85] uppercase whitespace-nowrap">
                    MICRO RACER
                  </h1>
                  <p className="text-neon-green font-black uppercase tracking-[0.4em] text-[10px] md:text-sm mt-8 border-t border-b border-neon-green/20 py-2">High Performance • Low Poly • Drift King</p>
                </motion.div>
              </motion.div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
                <button onClick={() => setMode('horizon')} className={`p-3 md:p-4 rounded-2xl border-4 border-black transition-all ${mode === 'horizon' ? 'bg-cyan-400 text-black scale-105 shadow-[6px_6px_0_0_#000]' : 'bg-black text-white hover:bg-white/10'}`}>
                   <RotateCw className="w-6 h-6 mx-auto mb-1" />
                   <h3 className="text-xs md:text-lg font-black uppercase text-center">3D WORLD</h3>
                </button>
                <button onClick={() => setMode('race')} className={`p-3 md:p-4 rounded-2xl border-4 border-black transition-all ${mode === 'race' ? 'bg-hot-pink text-white scale-105 shadow-[6px_6px_0_0_#000]' : 'bg-black text-white hover:bg-white/10'}`}>
                   <Trophy className="w-6 h-6 mx-auto mb-1" />
                   <h3 className="text-xs md:text-lg font-black uppercase text-center">Classic 2D</h3>
                </button>
                <button onClick={() => setMode('free')} className={`p-3 md:p-4 rounded-2xl border-4 border-black transition-all ${mode === 'free' ? 'bg-electric-blue text-black scale-105 shadow-[6px_6px_0_0_#000]' : 'bg-black text-white hover:bg-white/10'}`}>
                   <Compass className="w-6 h-6 mx-auto mb-1" />
                   <h3 className="text-xs md:text-lg font-black uppercase text-center">Free Roam</h3>
                </button>
                <button onClick={() => setMode('parking')} className={`p-3 md:p-4 rounded-2xl border-4 border-black transition-all ${mode === 'parking' ? 'bg-sun-yellow text-black scale-105 shadow-[6px_6px_0_0_#000]' : 'bg-black text-white hover:bg-white/10'}`}>
                   <div className="relative w-8 h-6 mx-auto mb-1">
                     <Gauge className="w-6 h-6 absolute inset-0 opacity-20" />
                     <CircleParking className="w-5 h-5 absolute inset-0 m-auto text-current" />
                   </div>
                   <h3 className="text-xs md:text-lg font-black uppercase text-center">Parking</h3>
                </button>
              </div>

              <div className="space-y-4 w-full">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Select Vehicle</span>
                <div className="grid grid-cols-5 gap-2 md:gap-3">
                  {(Object.keys(VEHICLE_CONFIGS) as VehicleType[]).map(v => (
                    <button key={v} onClick={() => setSelectedVehicle(v)} className={`px-1 py-2 md:px-2 md:py-3 rounded-xl border-2 border-black font-black text-[8px] md:text-[10px] uppercase transition-all whitespace-nowrap overflow-hidden text-ellipsis ${selectedVehicle === v ? 'bg-hot-pink text-black scale-105 shadow-[2px_2px_0_0_#FFF] md:shadow-[4px_4px_0_0_#FFF] z-10' : 'bg-black text-white hover:bg-white/10'}`}>
                        {VEHICLE_CONFIGS[v].name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 w-full">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Select Rival AI Vehicle</span>
                <div className="grid grid-cols-5 gap-2 md:gap-3">
                  {(Object.keys(VEHICLE_CONFIGS) as VehicleType[]).map(v => (
                    <button key={v} onClick={() => setSelectedAIVehicle(v)} className={`px-1 py-2 md:px-2 md:py-3 rounded-xl border-2 border-black font-black text-[8px] md:text-[10px] uppercase transition-all whitespace-nowrap overflow-hidden text-ellipsis ${selectedAIVehicle === v ? 'bg-cyan-400 text-black scale-105 shadow-[2px_2px_0_0_#FFF] md:shadow-[4px_4px_0_0_#FFF] z-10' : 'bg-black text-white hover:bg-white/10'}`}>
                        {VEHICLE_CONFIGS[v].name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Paint Job</span>
                <div className="flex justify-center gap-2">
                  {VEHICLE_COLORS.map(c => (
                    <button 
                      key={c} 
                      onClick={() => setCarColor(c)} 
                      className={`w-8 h-8 rounded-full border-2 transition-all ${carColor === c ? 'border-white scale-125' : 'border-black opacity-50 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Biome Customization</span>
                <div className="flex justify-center gap-3 flex-wrap">
                  {(Object.keys(BIOMES) as Biome[]).map(b => (
                    <button key={b} onClick={() => setBiome(b)} className={`px-4 py-3 rounded-xl border-2 border-black font-black text-xs uppercase transition-all ${biome === b ? 'bg-white text-black scale-110 shadow-[6px_6px_0_0_#FFEA00]' : 'bg-black text-white hover:bg-white/10'}`}>{b}</button>
                  ))}
                  <button onClick={() => setBiome(['plains','winter','sand','muddy'][Math.floor(Math.random()*4)] as Biome)} className="bg-sun-yellow text-black p-3 rounded-xl border-2 border-black"><RotateCw className="w-5 h-5"/></button>
                </div>
              </div>

              <button 
                onClick={() => {
                  if (mode === 'free') {
                      setMenuState('free_type');
                  } else {
                      resetGame(mode, biome, difficulty, false);
                      if (mode === 'race') {
                        setPhase('countdown');
                      } else {
                        setPhase('race');
                      }
                  }
                }} 
                className="w-full py-8 bg-neon-green hover:scale-[1.03] active:scale-95 transition-all rounded-3xl font-black text-4xl text-black border-4 border-black shadow-[12px_12px_0_0_#FF007F] uppercase group"
              >
                <div className="flex items-center justify-center gap-4">
                  <Flag className="w-10 h-10 group-hover:rotate-12 transition-transform" />
                  <span>IGNITION</span>
                  <Flag className="w-10 h-10 -scale-x-100 group-hover:-rotate-12 transition-transform" />
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Difficulty Selection */}
      <AnimatePresence>
        {phase === 'difficulty' && (
          <motion.div 
            key="difficulty-menu"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/95 z-[200] overflow-y-auto py-10"
          >
            <div className="max-w-xl w-full text-center space-y-12 p-8">
              <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <h1 className="text-6xl font-black tracking-tighter text-white drop-shadow-[6px_6px_0_#FFEA00] italic leading-none">CHOOSE YOUR STAKES</h1>
                <p className="text-electric-blue font-black uppercase tracking-[0.4em] text-xs mt-4">Select AI Rival Difficulty</p>
              </motion.div>

              <div className="grid grid-cols-1 gap-4">
                {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map(d => (
                  <button 
                    key={d} 
                    onClick={() => resetGame(mode, biome, d, false)}
                    className="group relative h-24 overflow-hidden rounded-2xl border-4 border-black transition-all hover:scale-[1.02] active:scale-95 shadow-[8px_8px_0_0_#000]"
                    style={{ backgroundColor: DIFFICULTY_CONFIG[d].color }}
                  >
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
                    <div className="flex items-center justify-between px-8 h-full">
                      <div className="text-left">
                        <h3 className="text-3xl font-black uppercase text-black leading-none">{d}</h3>
                        <p className="text-[10px] font-bold text-black opacity-60 uppercase tracking-widest mt-1">
                          Accuracy: {Math.floor(DIFFICULTY_CONFIG[d].turnSpeed * 1000)} • Speed: {Math.floor(DIFFICULTY_CONFIG[d].speedLimit * 100)}%
                        </p>
                      </div>
                      <Trophy className="w-10 h-10 text-black opacity-20 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setPhase('menu')} 
                className="text-white/40 font-black uppercase text-xs tracking-widest hover:text-white transition-colors underline underline-offset-8"
              >
                Back to Menu
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Free Roam Sandbox Options Menu */}
      <AnimatePresence>
        {phase === 'menu' && menuState === 'free_type' && (
          <motion.div 
            key="sandbox-menu"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/95 z-[300] overflow-y-auto py-10"
          >
            <div className="max-w-xl w-full text-center space-y-12 p-8">
              <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <h1 className="text-6xl font-black tracking-tighter text-white drop-shadow-[6px_6px_0_#00E5FF] italic leading-none">FREE ROAM MODE</h1>
                <p className="text-neon-green font-black uppercase tracking-[0.4em] text-xs mt-4">Select World Type</p>
              </motion.div>

              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={() => { setMenuState('main'); resetGame('free', biome, difficulty, false); }}
                  className="group relative h-24 overflow-hidden rounded-2xl border-4 border-black transition-all hover:scale-[1.02] active:scale-95 shadow-[8px_8px_0_0_#000] bg-electric-blue"
                >
                  <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
                  <div className="flex items-center justify-between px-8 h-full">
                    <div className="text-left">
                      <h3 className="text-3xl font-black uppercase text-black leading-none">NORMAL</h3>
                      <p className="text-[10px] font-bold text-black opacity-60 uppercase tracking-widest mt-1">
                        Trees, Rocks, Obstacles
                      </p>
                    </div>
                  </div>
                </button>
                <button 
                  onClick={() => setMenuState('free_sandbox_settings')}
                  className="group relative h-24 overflow-hidden rounded-2xl border-4 border-black transition-all hover:scale-[1.02] active:scale-95 shadow-[8px_8px_0_0_#000] bg-hot-pink"
                >
                  <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
                  <div className="flex items-center justify-between px-8 h-full">
                    <div className="text-left">
                      <h3 className="text-3xl font-black uppercase text-black leading-none">SANDBOX</h3>
                      <p className="text-[10px] font-bold text-black opacity-60 uppercase tracking-widest mt-1">
                        Completely empty flat map
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <button 
                onClick={() => setMenuState('main')} 
                className="text-white/40 font-black uppercase text-xs tracking-widest hover:text-white transition-colors underline underline-offset-8"
              >
                Back to Menu
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'menu' && menuState === 'free_sandbox_settings' && (
          <motion.div 
            key="sandbox-settings-menu"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/95 z-[300] overflow-y-auto py-10"
          >
            <div className="max-w-xl w-full text-center space-y-12 p-8">
              <h1 className="text-6xl font-black tracking-tighter text-white drop-shadow-[6px_6px_0_#FF007F] italic leading-none">SETTINGS</h1>
              
              <div className="space-y-6">
                <div className="bg-white/10 p-6 rounded-2xl">
                    <label className="text-white font-bold block mb-2">Map Biome</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(BIOMES) as Biome[]).map(b => (
                            <button 
                                key={b} 
                                onClick={() => setBiome(b)}
                                className={`p-2 rounded ${biome === b ? 'bg-electric-blue text-black' : 'bg-white/20 text-white'}`}
                            >
                                {BIOMES[b].name}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="bg-white/10 p-6 rounded-2xl">
                    <label className="text-white font-bold block mb-2">Speed: {sandboxSpeed.toFixed(1)}x</label>
                    <div className="flex justify-center gap-4">
                        <button onClick={() => setSandboxSpeed(s => Math.max(0.1, s-0.1))} className="bg-white text-black font-black p-4 rounded-lg">-</button>
                        <button onClick={() => setSandboxSpeed(s => Math.min(3, s+0.1))} className="bg-white text-black font-black p-4 rounded-lg">+</button>
                    </div>
                </div>
                <div className="bg-white/10 p-6 rounded-2xl">
                    <label className="text-white font-bold block mb-2">Drift: {sandboxDrift.toFixed(1)}x</label>
                    <div className="flex justify-center gap-4">
                        <button onClick={() => setSandboxDrift(s => Math.max(0.1, s-0.1))} className="bg-white text-black font-black p-4 rounded-lg">-</button>
                        <button onClick={() => setSandboxDrift(s => Math.min(3, s+0.1))} className="bg-white text-black font-black p-4 rounded-lg">+</button>
                    </div>
                </div>
              </div>
              
              <button 
                onClick={() => { setMenuState('main'); resetGame('free', biome, difficulty, true, sandboxSpeed, sandboxDrift); }} 
                className="w-full py-6 bg-electric-blue text-black rounded-2xl font-black text-2xl border-4 border-black shadow-[8px_8px_0_0_#FFEA00] uppercase"
              >
                START
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {showSandboxUI && (
        <div className="absolute top-4 right-4 bg-[#ff007f] p-4 rounded-xl z-40 text-black space-y-4 shadow-[8px_8px_0_0_black]">
            <h2 className="font-black text-xl">Sandbox Settings</h2>
            
            <div>
              <label className="block text-sm font-bold">Vehicle</label>
              <select value={selectedVehicle} onChange={(e) => {
                  const newV = e.target.value as VehicleType;
                  setSelectedVehicle(newV);
                  // Update trailer status dynamically
                  const wasTrailer = !!gameState.current.car?.trailer;
                  const isTrailer = !!VEHICLE_CONFIGS[newV].hasTrailer;
                  if (wasTrailer !== isTrailer) {
                      gameState.current.car.trailer = isTrailer ? { x: gameState.current.car.x, y: gameState.current.car.y, angle: gameState.current.car.angle, vx: 0, vy: 0 } : undefined;
                  }
              }} className="w-full bg-white p-2 rounded">
                {(Object.keys(VEHICLE_CONFIGS) as VehicleType[]).map(v => <option key={v} value={v}>{VEHICLE_CONFIGS[v].name}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold">Map Biome</label>
              <select value={biome} onChange={(e) => { setBiome(e.target.value as Biome); resetGame('free', e.target.value as Biome, difficulty, true, gameState.current.sandboxSpeed, gameState.current.sandboxDrift); }} className="w-full bg-white p-2 rounded">
                {(Object.keys(BIOMES) as Biome[]).map(b => <option key={b} value={b}>{BIOMES[b].name}</option>)}
              </select>
            </div>

            <div>
                <label className="block text-sm font-bold">Speed: {gameState.current.sandboxSpeed.toFixed(1)}x</label>
                <input type="range" min="0.1" max="5" step="0.1" value={gameState.current.sandboxSpeed} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSandboxSpeed(val);
                    gameState.current.sandboxSpeed = val;
                }} className="w-full" />
            </div>
            <div>
                <label className="block text-sm font-bold">Drift: {gameState.current.sandboxDrift.toFixed(1)}x</label>
                <input type="range" min="0.1" max="5" step="0.1" value={gameState.current.sandboxDrift} onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSandboxDrift(val);
                    gameState.current.sandboxDrift = val;
                }} className="w-full" />
            </div>
        </div>
      )}
      <AnimatePresence>
        {phase === 'crash' && (
          <motion.div 
            key="crash-overlay"
            initial={{ scale: 0.8, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            exit={{ scale: 0.8, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-xl z-[60]"
          >
            <div className="text-center space-y-8 p-12 bg-black border-8 border-hot-pink rounded-[40px] shadow-[0_0_100px_rgba(255,0,127,0.5)]">
              <h1 className="text-7xl font-black italic text-white drop-shadow-[5px_5px_0_#FF007F]">
                {gameState.current.winner === 'player' ? 'VICTORY!' : 'WRECKED!'}
              </h1>
              <div className="text-4xl font-black text-electric-blue uppercase">
                {mode === 'parking' 
                  ? (gameState.current.winner === 'player' ? `Level ${gameState.current.level} Clear` : `Failed Level ${gameState.current.level}`)
                  : (gameState.current.winner ? `Completed ${gameState.current.maxLaps} Laps` : `${Math.floor(distance)} METERS`)}
              </div>
              <button onClick={() => resetGame()} className="w-full py-6 bg-neon-green text-black rounded-2xl font-black text-2xl border-4 border-black shadow-[8px_8px_0_0_#FFEA00] uppercase">
                {gameState.current.winner === 'player' && mode === 'parking' ? 'Next Level' : 'Retry'}
              </button>
              <button onClick={() => setPhase('menu')} className="block mx-auto text-white/40 font-black uppercase text-xs tracking-widest hover:text-white">Main Menu</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
