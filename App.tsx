import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type WhaleAgent = {
  id: string;
  name: string;
  isPlayer: boolean;
  silhouette: 'raker' | 'leviathan' | 'orca';
  species: 'humpback' | 'longfin';
  personality: 'curious' | 'calm' | 'wanderer';
  tint: string;
  size: number;
  depthScale: number;
  depthOpacity: number;
  x: number;
  y: number;
  heading: number;
  targetHeading: number;
  speed: number;
  baseSpeed: number;
  targetSpeed: number;
  turnVelocity: number;
  turnFreq: number;
  turnAmp: number;
  wanderClock: number;
  wanderInterval: number;
  phase: number;
  surgeFreq: number;
  surgeAmp: number;
  socialAffinity: number;
  calmness: number;
  wanderJitter: number;
  roamX: number;
  roamY: number;
  xAnim: Animated.Value;
  yAnim: Animated.Value;
  angleAnim: Animated.Value;
  breathAnim: Animated.Value;
  tailAnim: Animated.Value;
  bobAnim: Animated.Value;
  opacityAnim: Animated.Value;
};

type Particle = {
  id: string;
  x: number;
  y: number;
  size: number;
  drift: Animated.Value;
  twinkle: Animated.Value;
};

type InteractionLink = {
  key: string;
  x: number;
  y: number;
  length: number;
  angle: number;
  intensity: number;
};

type PersistedWhaleState = Omit<
  WhaleAgent,
  'xAnim' | 'yAnim' | 'angleAnim' | 'breathAnim' | 'tailAnim' | 'bobAnim' | 'opacityAnim'
>;

type PersistedWorldState = {
  savedAt: number;
  simClock: number;
  whales: PersistedWhaleState[];
};

const WHALE_COUNT = 6;
const PARTICLE_COUNT = 38;
const BGM_TRACK_WIDTH = 116;
const WORLD_STORAGE_KEY = 'the_whales_world_v1';
const PLAYER_WHALE_ID = 'player-whale';
const CAMERA_RANGE_X = 0.28;
const CAMERA_RANGE_Y = 0.22;
const MAIN_BGM = require('./assets/audio/forest.mp3');
const TRACKS = [
  { title: 'YOONHAN - sa ryu ni forest', source: MAIN_BGM },
] as const;

export default function App() {
  const { width, height } = useWindowDimensions();
  const [, setReadyTick] = useState(0);
  const [bgmLevel, setBgmLevel] = useState(0.62);
  const [bgmExpanded, setBgmExpanded] = useState(true);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserStart, setNeedsUserStart] = useState(false);
  const [followTargetId, setFollowTargetId] = useState<string | null>(null);
  const [followLocked, setFollowLocked] = useState(false);
  const [myWhalesExpanded, setMyWhalesExpanded] = useState(false);
  const [selectedWhaleId, setSelectedWhaleId] = useState<string | null>(null);
  const [interactionLinks, setInteractionLinks] = useState<InteractionLink[]>([]);
  const topTitleOpacity = useRef(new Animated.Value(0)).current;
  const whalesRef = useRef<WhaleAgent[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const bgmLevelAnim = useRef(new Animated.Value(0.62)).current;
  const bgmExpandAnim = useRef(new Animated.Value(1)).current;
  const myWhalesAnim = useRef(new Animated.Value(0)).current;
  const trackTitleOpacity = useRef(new Animated.Value(1)).current;
  const whaleInfoAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const trackIndexRef = useRef(0);
  const isUnmountedRef = useRef(false);
  const interactionElapsedRef = useRef(0);
  const saveElapsedRef = useRef(0);
  const simClockRef = useRef(0);
  const cameraXAnim = useRef(new Animated.Value(0)).current;
  const cameraYAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef({ x: 0, y: 0 });
  const freeCameraPointRef = useRef<{ x: number; y: number } | null>(null);
  const followTargetIdRef = useRef<string | null>(null);
  const followLockedRef = useRef(false);
  const activeInteractionKeysRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<any>(null);
  const lastToneAtRef = useRef(0);

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }).map((_, i) => ({
      id: `p-${i}`,
      x: Math.random() * Math.max(width, 360),
      y: Math.random() * Math.max(height, 640),
      size: 1.2 + Math.random() * 2.8,
      drift: new Animated.Value(Math.random()),
      twinkle: new Animated.Value(0.22 + Math.random() * 0.4),
    }));
    // Keep particle identities stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedWhale = selectedWhaleId ? whalesRef.current.find((w) => w.id === selectedWhaleId) ?? null : null;
  const myWhales = whalesRef.current.filter((w) => w.isPlayer);
  const selectedWhalePersonality = selectedWhale ? describePersonality(selectedWhale.personality) : '';
  const selectedWhaleInteraction = selectedWhale
    ? describeWhaleInteraction(selectedWhale, whalesRef.current, width, height)
    : '';

  useEffect(() => {
    followTargetIdRef.current = followTargetId;
  }, [followTargetId]);

  useEffect(() => {
    followLockedRef.current = followLocked;
  }, [followLocked]);

  useEffect(() => {
    for (const p of particles) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(p.drift, {
            toValue: 1,
            duration: 16000 + Math.random() * 12000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(p.drift, {
            toValue: 0,
            duration: 16000 + Math.random() * 12000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(p.twinkle, {
            toValue: 0.88,
            duration: 2800 + Math.random() * 2600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(p.twinkle, {
            toValue: 0.22,
            duration: 2800 + Math.random() * 2600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [particles]);

  useEffect(() => {
    topTitleOpacity.setValue(0);
    Animated.timing(topTitleOpacity, {
      toValue: 1,
      duration: 1200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      loadTrack(trackIndexRef.current, true);
    }, 220);
    return () => clearTimeout(timer);
  }, [topTitleOpacity]);

  const setBgm = (next: number) => {
    const level = clamp(next, 0, 1);
    setBgmLevel(level);
    Animated.timing(bgmLevelAnim, {
      toValue: level,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const bgmResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.locationX;
          setBgm(x / BGM_TRACK_WIDTH);
        },
        onPanResponderMove: (evt) => {
          const x = evt.nativeEvent.locationX;
          setBgm(x / BGM_TRACK_WIDTH);
        },
      }),
    [bgmLevelAnim]
  );

  const animateTrackTitle = () => {
    trackTitleOpacity.setValue(0.2);
    Animated.timing(trackTitleOpacity, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const loadTrack = async (index: number, shouldPlay: boolean) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const next = new Audio.Sound();
      await next.loadAsync(TRACKS[index].source, {
        shouldPlay,
        volume: bgmLevel,
        isLooping: true,
      });
      if (isUnmountedRef.current) {
        await next.unloadAsync();
        return;
      }
      soundRef.current = next;
      trackIndexRef.current = index;
      setTrackIndex(index);
      setIsPlaying(shouldPlay);
      if (shouldPlay) setNeedsUserStart(false);
      animateTrackTitle();
    } catch {
      setIsPlaying(false);
      if (shouldPlay) setNeedsUserStart(true);
    }
  };

  const goPrevTrack = async () => {
    const nextIndex = (trackIndexRef.current - 1 + TRACKS.length) % TRACKS.length;
    await loadTrack(nextIndex, isPlaying);
  };

  const goNextTrack = async () => {
    const nextIndex = (trackIndexRef.current + 1) % TRACKS.length;
    await loadTrack(nextIndex, isPlaying);
  };

  const toggleBgmPanel = () => {
    const next = !bgmExpanded;
    setBgmExpanded(next);
    Animated.timing(bgmExpandAnim, {
      toValue: next ? 1 : 0,
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const togglePlayPause = async () => {
    try {
      if (!soundRef.current) {
        await loadTrack(trackIndexRef.current, true);
        return;
      }
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch {
        // no-op
      }
    })();

    return () => {
      isUnmountedRef.current = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!needsUserStart || isPlaying) return;
    const g: any = globalThis as any;
    const d = g?.document;
    if (!d?.addEventListener) return;

    const tryStart = async () => {
      await loadTrack(trackIndexRef.current, true);
    };

    const onUnlock = () => {
      tryStart();
      d.removeEventListener('pointerdown', onUnlock);
      d.removeEventListener('touchstart', onUnlock);
      d.removeEventListener('keydown', onUnlock);
    };

    d.addEventListener('pointerdown', onUnlock, { once: true });
    d.addEventListener('touchstart', onUnlock, { once: true });
    d.addEventListener('keydown', onUnlock, { once: true });

    return () => {
      d.removeEventListener('pointerdown', onUnlock);
      d.removeEventListener('touchstart', onUnlock);
      d.removeEventListener('keydown', onUnlock);
    };
  }, [needsUserStart, isPlaying]);

  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(bgmLevel);
    }
  }, [bgmLevel]);

  useEffect(() => {
    Animated.timing(whaleInfoAnim, {
      toValue: selectedWhaleId ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selectedWhaleId, whaleInfoAnim]);

  useEffect(() => {
    Animated.timing(myWhalesAnim, {
      toValue: myWhalesExpanded ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [myWhalesAnim, myWhalesExpanded]);

  const playLowWhaleTone = () => {
    const now = Date.now();
    if (now - lastToneAtRef.current < 800) return;
    lastToneAtRef.current = now;
    try {
      const g: any = globalThis as any;
      const Ctx = g.AudioContext || g.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      osc.type = 'sine';
      filt.type = 'lowpass';
      filt.frequency.value = 180;
      const t0 = ctx.currentTime;
      osc.frequency.setValueAtTime(62, t0);
      osc.frequency.exponentialRampToValueAtTime(42, t0 + 1.1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.032, t0 + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
      osc.connect(filt);
      filt.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.35);
    } catch {
      // no-op on unsupported platforms
    }
  };

  useEffect(() => {
    if (!width || !height) return;
    let mounted = true;

    const persistWorld = async () => {
      try {
        const payload: PersistedWorldState = {
          savedAt: Date.now(),
          simClock: simClockRef.current,
          whales: whalesRef.current.map(serializeWhale),
        };
        await writeStoredWorld(payload);
      } catch {
        // storage may be unavailable; skip persistence safely.
      }
    };

    const step = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = Math.min((t - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = t;
      simClockRef.current += dt;
      const simT = simClockRef.current;

      const whales = whalesRef.current;
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const interactionRadius = Math.min(width, height) * 0.19;

      for (const w of whales) {
        w.wanderClock += dt;

        if (w.wanderClock >= w.wanderInterval) {
          w.wanderClock = 0;
          w.wanderInterval = (5.4 + Math.random() * 4.8) * (1 + w.calmness * 0.22);
          w.targetHeading = w.heading + randomRange(-w.wanderJitter, w.wanderJitter);
          w.targetSpeed = randomRange(0.9, 1.1) * w.baseSpeed;

          if (w.personality === 'wanderer' && Math.random() < 0.5) {
            w.roamX = randomRange(width * 0.08, width * 0.92);
            w.roamY = randomRange(height * 0.08, height * 0.92);
          }
        }

        // Natural steering: heading changes via damped angular velocity, avoiding twitchy turns.
        const waveTurn = Math.sin(simT * w.turnFreq + w.phase) * w.turnAmp;
        let desiredHeading = w.targetHeading + waveTurn * 0.62;

        const marginX = 80;
        const marginY = 70;
        const edgePressureX =
          w.x < marginX ? (marginX - w.x) / marginX : w.x > width - marginX ? (w.x - (width - marginX)) / marginX : 0;
        const edgePressureY =
          w.y < marginY ? (marginY - w.y) / marginY : w.y > height - marginY ? (w.y - (height - marginY)) / marginY : 0;
        const edgePressure = Math.max(edgePressureX, edgePressureY);

        if (edgePressure > 0) {
          const toCenter = Math.atan2(centerY - w.y, centerX - w.x);
          desiredHeading = lerpAngle(desiredHeading, toCenter, clamp(edgePressure * 0.74, 0, 0.86));
        }

        const neighborPull = computeNeighborPull(w, whales, width, height);
        if (neighborPull.weight > 0) {
          const socialX = neighborPull.x * Math.sign(w.socialAffinity || 1);
          const socialY = neighborPull.y * Math.sign(w.socialAffinity || 1);
          const socialHeading = Math.atan2(socialY, socialX);
          const socialStrength = 0.07 * neighborPull.weight * Math.abs(w.socialAffinity);
          desiredHeading = lerpAngle(desiredHeading, socialHeading, socialStrength);
        }

        if (w.personality === 'wanderer') {
          const roamHeading = Math.atan2(w.roamY - w.y, w.roamX - w.x);
          desiredHeading = lerpAngle(desiredHeading, roamHeading, 0.06);
        }

        // Close interaction: align direction and briefly co-swim when whales are near.
        let nearCount = 0;
        let nearDx = 0;
        let nearDy = 0;
        let nearHeadingX = 0;
        let nearHeadingY = 0;
        let nearSpeed = 0;
        for (const other of whales) {
          if (other.id === w.id) continue;
          const dx = other.x - w.x;
          const dy = other.y - w.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < interactionRadius && d > 1) {
            const closeness = 1 - d / interactionRadius;
            nearDx += (dx / d) * closeness;
            nearDy += (dy / d) * closeness;
            nearHeadingX += Math.cos(other.heading) * closeness;
            nearHeadingY += Math.sin(other.heading) * closeness;
            nearSpeed += other.speed * closeness;
            nearCount += closeness;
          }
        }
        if (nearCount > 0) {
          const towardPeer = Math.atan2(nearDy, nearDx);
          const alignHeading = Math.atan2(nearHeadingY, nearHeadingX);
          desiredHeading = lerpAngle(desiredHeading, towardPeer, 0.06 * nearCount);
          desiredHeading = lerpAngle(desiredHeading, alignHeading, 0.09 * nearCount);
          w.targetSpeed = lerp(w.targetSpeed, nearSpeed / nearCount, 0.06);
        }

        const turnError = angleDelta(w.heading, desiredHeading);
        w.turnVelocity += turnError * dt * (0.56 * (1 - w.calmness * 0.25));
        w.turnVelocity = clamp(w.turnVelocity, -0.32 * (1 - w.calmness * 0.2), 0.32 * (1 - w.calmness * 0.2));
        w.turnVelocity *= Math.exp(-dt * (1.65 + w.calmness * 0.6));
        w.heading += w.turnVelocity * dt * 0.9;

        const surge = 1 + Math.sin(simT * w.surgeFreq + w.phase * 0.8) * w.surgeAmp;
        const desiredSpeed = w.targetSpeed * surge * (1 - w.calmness * 0.18);
        w.speed = lerp(w.speed, desiredSpeed, dt * 0.34);

        w.x += Math.cos(w.heading) * w.speed * dt;
        w.y += Math.sin(w.heading) * w.speed * dt;

        w.x = clamp(w.x, 24, width - 24);
        w.y = clamp(w.y, 22, height - 22);

        const breathe = 0.5 + 0.5 * Math.sin(simT * 0.62 + w.phase * 1.5);
        const tailWag = Math.sin(simT * 1.38 * (0.9 + w.depthScale * 0.52) + w.phase) * 0.92;
        const bob = Math.sin(simT * 0.92 * (0.92 + w.depthScale * 0.34) + w.phase * 1.2);
        const opacityPulse = 0.5 + 0.5 * Math.sin(simT * 0.4 + w.phase * 0.7);

        w.xAnim.setValue(w.x);
        w.yAnim.setValue(w.y);
        w.angleAnim.setValue(w.heading);
        w.breathAnim.setValue(breathe);
        w.tailAnim.setValue(tailWag);
        w.bobAnim.setValue(bob);
        w.opacityAnim.setValue(w.depthOpacity * (0.86 + opacityPulse * 0.18));
      }

      interactionElapsedRef.current += dt;
      saveElapsedRef.current += dt;

      if (interactionElapsedRef.current > 0.09) {
        interactionElapsedRef.current = 0;
        const links = computeInteractionLinks(whales, width, height);
        setInteractionLinks(links);
        const current = new Set(links.map((l) => l.key));
        for (const k of current) {
          if (!activeInteractionKeysRef.current.has(k)) {
            playLowWhaleTone();
          }
        }
        activeInteractionKeysRef.current = current;
      }

      if (saveElapsedRef.current > 4.5) {
        saveElapsedRef.current = 0;
        void persistWorld();
      }

      const shouldFollow = followLockedRef.current;
      const followId = followTargetIdRef.current;
      if (shouldFollow && followId) {
        const player = whales.find((w) => w.id === followId) ?? whales.find((w) => w.id === PLAYER_WHALE_ID) ?? whales[0];
        if (player) {
          // Follow mode should keep the tracked whale at the screen center.
          const targetX = centerX - player.x;
          const targetY = centerY - player.y;
          cameraRef.current.x = lerp(cameraRef.current.x, targetX, dt * 2.4);
          cameraRef.current.y = lerp(cameraRef.current.y, targetY, dt * 2.4);
          cameraXAnim.setValue(cameraRef.current.x);
          cameraYAnim.setValue(cameraRef.current.y);
        }
      } else if (freeCameraPointRef.current) {
        const p = freeCameraPointRef.current;
        // Click-to-move mode should center the tapped whale precisely.
        const targetX = centerX - p.x;
        const targetY = centerY - p.y;
        cameraRef.current.x = lerp(cameraRef.current.x, targetX, dt * 1.7);
        cameraRef.current.y = lerp(cameraRef.current.y, targetY, dt * 1.7);
        cameraXAnim.setValue(cameraRef.current.x);
        cameraYAnim.setValue(cameraRef.current.y);
      } else {
        cameraRef.current.x = lerp(cameraRef.current.x, 0, dt * 1.15);
        cameraRef.current.y = lerp(cameraRef.current.y, 0, dt * 1.15);
        cameraXAnim.setValue(cameraRef.current.x);
        cameraYAnim.setValue(cameraRef.current.y);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    const bootstrap = async () => {
      const stored = await readStoredWorld();
      if (!mounted) return;

      let whales = createWhales(width, height);
      let simClock = 0;

      if (stored?.whales?.length) {
        whales = hydrateWhales(stored.whales, width, height);
        simClock = stored.simClock || 0;
        const elapsedSec = clamp((Date.now() - stored.savedAt) / 1000, 0, 60 * 60 * 8);
        if (elapsedSec > 1) {
          simClock = fastForwardWhales(whales, width, height, simClock, elapsedSec);
        }
      }

      whales = ensurePlayerWhale(whales, width, height);

      whalesRef.current = whales;
      simClockRef.current = simClock;
      const player = whales.find((w) => w.id === PLAYER_WHALE_ID) ?? whales[0];
      if (player) {
        setFollowTargetId(null);
        setFollowLocked(false);
        freeCameraPointRef.current = null;
        setSelectedWhaleId(null);
      }
      setReadyTick((v) => v + 1);

      const links = computeInteractionLinks(whales, width, height);
      setInteractionLinks(links);
      activeInteractionKeysRef.current = new Set(links.map((l) => l.key));
      rafRef.current = requestAnimationFrame(step);
    };

    bootstrap();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = 0;
      void persistWorld();
    };
  }, [height, width]);

  const toggleMyWhalesPanel = () => {
    setMyWhalesExpanded((v) => !v);
  };

  const onPressMyWhale = (whaleId: string) => {
    setSelectedWhaleId(whaleId);
    setFollowTargetId(whaleId);
    setFollowLocked(true);
    freeCameraPointRef.current = null;
  };

  const releaseFollow = () => {
    setFollowLocked(false);
    setFollowTargetId(null);
    freeCameraPointRef.current = null;
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LinearGradient
        colors={['#06111B', '#091B2A', '#0B1C2C', '#04070D']}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.88, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="none" style={styles.lightRayLayer}>
        <View style={[styles.ray, styles.ray1]} />
        <View style={[styles.ray, styles.ray2]} />
        <View style={[styles.ray, styles.ray3]} />
      </View>

      <Animated.View
        style={[
          styles.worldLayer,
          {
            transform: [{ translateX: cameraXAnim }, { translateY: cameraYAnim }],
          },
        ]}
      >
        {particles.map((p) => {
          const yDrift = p.drift.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
          const xDrift = p.drift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

          return (
            <Animated.View
              key={p.id}
              pointerEvents="none"
              style={[
                styles.particle,
                {
                  width: p.size,
                  height: p.size,
                  left: p.x,
                  top: p.y,
                  opacity: p.twinkle,
                  transform: [{ translateY: yDrift }, { translateX: xDrift }],
                },
              ]}
            />
          );
        })}

        {interactionLinks.map((link) => (
          <View
            key={link.key}
            pointerEvents="none"
            style={[
              styles.interactionBridgeWrap,
              {
                left: link.x,
                top: link.y,
                width: link.length,
                opacity: 0.08 + link.intensity * 0.26,
                transform: [{ translateX: -link.length * 0.5 }, { rotate: `${link.angle}rad` }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(146,216,245,0)', 'rgba(188,236,255,0.55)', 'rgba(146,216,245,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.interactionBridge}
            />
            <View style={[styles.interactionCore, { opacity: 0.22 + link.intensity * 0.35 }]} />
          </View>
        ))}

        {whalesRef.current.map((w) => {
        const whaleWidth = w.size * w.depthScale;
        const whaleHeight = whaleWidth * (w.species === 'longfin' ? 0.38 : 0.46);
        const rotate = w.angleAnim.interpolate({
          inputRange: [-12.566, 12.566],
          outputRange: ['-12.566rad', '12.566rad'],
        });
        const breatheScale = w.breathAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1.02],
        });
        const tailRotate = w.tailAnim.interpolate({
          inputRange: [-1, 1],
          outputRange: ['-0.075rad', '0.075rad'],
        });
        const bobY = w.bobAnim.interpolate({
          inputRange: [-1, 1],
          outputRange: [-2.4, 2.4],
        });
        const bodyRoll = w.tailAnim.interpolate({
          inputRange: [-1, 1],
          outputRange: ['-0.018rad', '0.018rad'],
        });

          return (
          <AnimatedPressable
            key={w.id}
            onPress={() => {
              setFollowLocked(false);
              setFollowTargetId(null);
              freeCameraPointRef.current = { x: w.x, y: w.y };
              setSelectedWhaleId(w.id);
            }}
            style={[
              styles.whaleHitbox,
              {
                width: whaleWidth,
                height: whaleHeight,
                marginLeft: -whaleWidth / 2,
                marginTop: -whaleHeight / 2,
                transform: [{ translateX: w.xAnim }, { translateY: Animated.add(w.yAnim, bobY) }],
              },
            ]}
          >
            <Animated.View
              pointerEvents="none"
            style={[
              styles.whaleWrap,
              {
                width: '100%',
                height: '100%',
                opacity: w.opacityAnim,
                transform: [
                  { rotate },
                  { rotateZ: bodyRoll },
                  { scale: breatheScale },
                ],
              },
            ]}
          >
            <View style={[styles.whaleAura, { backgroundColor: withAlpha(w.tint, 0.12) }]} />
            {w.isPlayer ? <View style={styles.playerWhaleAura} /> : null}
            <View style={styles.whaleShadow} />
            <Animated.View style={[styles.silhouetteShell, { transform: [{ rotate: tailRotate }] }]}>
              <WhaleSilhouette
                whaleId={w.id}
                silhouette={w.silhouette}
                tint={w.tint}
                isPlayer={w.isPlayer}
              />
            </Animated.View>
            <LinearGradient
              colors={['rgba(138,206,236,0.05)', 'rgba(138,206,236,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.wakeGlow}
            />
            </Animated.View>
          </AnimatedPressable>
        );
        })}
      </Animated.View>

      <Animated.View
        pointerEvents={selectedWhale ? 'auto' : 'none'}
        style={[
          styles.whaleInfoWrap,
          {
            opacity: whaleInfoAnim,
            transform: [
              {
                translateY: whaleInfoAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(14,30,44,0.66)', 'rgba(9,20,33,0.48)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.whaleInfoCard}
        >
          <View style={styles.whaleInfoHeader}>
            <Text style={styles.whaleInfoName}>{selectedWhale?.name ?? ''}</Text>
            <Pressable onPress={() => setSelectedWhaleId(null)} hitSlop={10}>
              <Text style={styles.whaleInfoClose}>hide</Text>
            </Pressable>
          </View>
          <Text style={styles.whaleInfoPersonality}>
            {selectedWhale?.isPlayer ? 'Your Whale' : 'Ocean Whale'} - {selectedWhalePersonality}
          </Text>
          <Text style={styles.whaleInfoInteraction}>{selectedWhaleInteraction}</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View pointerEvents="box-none" style={[styles.myWhalesWrap, { opacity: topTitleOpacity }]}>
        <Pressable onPress={toggleMyWhalesPanel} style={styles.myWhalesToggleRow}>
          <Text style={styles.myWhalesLabel}>MY WHALES</Text>
          <Text style={styles.myWhalesToggleGlyph}>{myWhalesExpanded ? '-' : '+'}</Text>
        </Pressable>

        <Animated.View
          style={[
            styles.myWhalesPanel,
            {
              opacity: myWhalesAnim,
              maxHeight: myWhalesAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 210],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(12,27,39,0.62)', 'rgba(8,18,30,0.46)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.myWhalesCard}
          >
            {myWhales.map((w) => {
              const isFollowing = followLocked && followTargetId === w.id;
              return (
                <Pressable key={w.id} onPress={() => onPressMyWhale(w.id)} style={styles.myWhaleRow}>
                  <View style={[styles.myWhaleDot, { backgroundColor: isFollowing ? 'rgba(193,241,255,0.78)' : 'rgba(164,212,232,0.44)' }]} />
                  <View style={styles.myWhaleTextGroup}>
                    <Text style={styles.myWhaleName}>{w.name}</Text>
                    <Text style={styles.myWhaleMeta}>{describePersonality(w.personality)}</Text>
                  </View>
                  <Text style={styles.myWhaleState}>{isFollowing ? 'Following' : 'Observe'}</Text>
                </Pressable>
              );
            })}

            <Pressable onPress={releaseFollow} style={styles.myWhaleReleaseBtn}>
              <Text style={styles.myWhaleReleaseText}>{followLocked ? 'Release Follow' : 'Camera Free'}</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </Animated.View>

      <Animated.View pointerEvents="box-none" style={[styles.bgmWrap, { opacity: topTitleOpacity }]}>
        <Pressable onPress={toggleBgmPanel} style={styles.bgmToggleRow}>
          <Text style={styles.bgmLabel}>BGM</Text>
          <Text style={styles.bgmToggleGlyph}>{bgmExpanded ? '-' : '+'}</Text>
        </Pressable>

        <Animated.View
          style={[
            styles.bgmPanel,
            {
              opacity: bgmExpandAnim,
              maxHeight: bgmExpandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 160],
              }),
            },
          ]}
        >
          <View style={styles.bgmTrackHitbox} {...bgmResponder.panHandlers}>
            <View style={styles.bgmTrackBase} />
            <Animated.View
              style={[
                styles.bgmTrackActive,
                {
                  width: bgmLevelAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, BGM_TRACK_WIDTH],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.bgmThumb,
                {
                  transform: [
                    {
                      translateX: bgmLevelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, BGM_TRACK_WIDTH],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
          <Text style={styles.bgmValue}>{Math.round(bgmLevel * 100)}%</Text>

          <Animated.Text style={[styles.trackTitle, { opacity: trackTitleOpacity }]}>
            {TRACKS[trackIndex].title}
          </Animated.Text>
          <View style={styles.transportRow}>
            <Pressable onPress={goPrevTrack} style={styles.transportBtn}>
              <Text style={styles.transportText}>PREV</Text>
            </Pressable>
            <Pressable onPress={togglePlayPause} style={styles.transportBtn}>
              <Text style={styles.transportText}>{isPlaying ? 'PAUSE' : 'PLAY'}</Text>
            </Pressable>
            <Pressable onPress={goNextTrack} style={styles.transportBtn}>
              <Text style={styles.transportText}>NEXT</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.topTitleWrap, { opacity: topTitleOpacity }]}>
        <Text style={styles.topTitleText}>The Whales</Text>
      </Animated.View>

    </View>
  );
}

function createWhales(width: number, height: number): WhaleAgent[] {
  const palette = [
    'rgba(120,188,226,1)',
    'rgba(108,177,220,1)',
    'rgba(132,198,232,1)',
    'rgba(96,166,212,1)',
    'rgba(114,183,223,1)',
    'rgba(100,170,214,1)',
  ];

  return Array.from({ length: WHALE_COUNT }).map((_, i) => {
    const depthScale = i < 2 ? randomRange(1.04, 1.14) : i < 5 ? randomRange(0.9, 1.0) : randomRange(0.74, 0.84);
    const depthOpacity = i < 2 ? randomRange(0.7, 0.84) : i < 5 ? randomRange(0.54, 0.68) : randomRange(0.34, 0.46);
    const heading = randomRange(-Math.PI, Math.PI);
    const personality = pickPersonality();
    const x = randomRange(width * 0.18, width * 0.82);
    const y = randomRange(height * 0.2, height * 0.8);
    const isPlayer = i === 0;
    const name = pickWhaleName(i, isPlayer);

    let baseSpeed = randomRange(14, 32) * depthScale;
    let turnAmp = randomRange(0.08, 0.2);
    let turnFreq = randomRange(0.48, 0.92);
    let surgeFreq = randomRange(0.34, 0.62);
    let surgeAmp = randomRange(0.05, 0.12);
    let socialAffinity = 1;
    let calmness = 0.3;
    let wanderJitter = 0.34;

    if (personality === 'curious') {
      baseSpeed *= randomRange(1.03, 1.14);
      turnAmp *= randomRange(1.08, 1.22);
      socialAffinity = randomRange(1.25, 1.55);
      calmness = randomRange(0.18, 0.34);
      wanderJitter = randomRange(0.34, 0.48);
    } else if (personality === 'calm') {
      baseSpeed *= randomRange(0.78, 0.92);
      turnAmp *= randomRange(0.68, 0.86);
      turnFreq *= randomRange(0.82, 0.94);
      surgeAmp *= randomRange(0.7, 0.9);
      socialAffinity = randomRange(0.86, 1.05);
      calmness = randomRange(0.7, 0.92);
      wanderJitter = randomRange(0.16, 0.26);
    } else {
      // wanderer
      baseSpeed *= randomRange(0.94, 1.08);
      turnAmp *= randomRange(0.92, 1.08);
      surgeFreq *= randomRange(0.96, 1.12);
      socialAffinity = randomRange(-1.35, -0.95);
      calmness = randomRange(0.3, 0.5);
      wanderJitter = randomRange(0.28, 0.38);
    }

    if (isPlayer) {
      baseSpeed *= 0.96;
      socialAffinity = 1.08;
      calmness = 0.52;
      wanderJitter *= 0.9;
    }

    return {
      id: isPlayer ? PLAYER_WHALE_ID : `whale-${i + 1}`,
      name,
      isPlayer,
      silhouette: pickSilhouette(i),
      species: i % 2 === 0 ? 'humpback' : 'longfin',
      personality,
      tint: palette[i % palette.length],
      size: randomRange(104, 140),
      depthScale,
      depthOpacity,
      x,
      y,
      heading,
      targetHeading: heading,
      speed: baseSpeed,
      baseSpeed,
      targetSpeed: baseSpeed,
      turnVelocity: randomRange(-0.05, 0.05),
      turnFreq,
      turnAmp,
      wanderClock: Math.random() * 3,
      wanderInterval: 3.6 + Math.random() * 3.2,
      phase: Math.random() * Math.PI * 2,
      surgeFreq,
      surgeAmp,
      socialAffinity,
      calmness,
      wanderJitter,
      roamX: randomRange(width * 0.08, width * 0.92),
      roamY: randomRange(height * 0.08, height * 0.92),
      xAnim: new Animated.Value(x),
      yAnim: new Animated.Value(y),
      angleAnim: new Animated.Value(heading),
      breathAnim: new Animated.Value(Math.random()),
      tailAnim: new Animated.Value(0),
      bobAnim: new Animated.Value(0),
      opacityAnim: new Animated.Value(depthOpacity),
    };
  });
}

function ensurePlayerWhale(whales: WhaleAgent[], width: number, height: number): WhaleAgent[] {
  if (!whales.length) return createWhales(width, height);
  const hasPlayer = whales.some((w) => w.id === PLAYER_WHALE_ID || w.isPlayer);
  if (hasPlayer) {
    return whales.map((w, idx) => {
      const isPlayer = w.id === PLAYER_WHALE_ID || w.isPlayer;
      return {
        ...w,
        id: isPlayer ? PLAYER_WHALE_ID : w.id === PLAYER_WHALE_ID ? `whale-${idx + 1}` : w.id,
        name: w.name || pickWhaleName(idx, isPlayer),
        isPlayer,
      };
    });
  }

  const i = Math.floor(Math.random() * whales.length);
  return whales.map((w, idx) => ({
    ...w,
    id: idx === i ? PLAYER_WHALE_ID : w.id,
    name: w.name || pickWhaleName(idx, idx === i),
    isPlayer: idx === i,
  }));
}

function pickWhaleName(index: number, isPlayer: boolean): string {
  if (isPlayer) return 'My Tide';
  const names = ['Lune', 'Nere', 'Sora', 'Mare', 'Pelagia', 'Noctil'];
  return names[index % names.length];
}

function pickSilhouette(index: number): WhaleAgent['silhouette'] {
  const silhouettes: WhaleAgent['silhouette'][] = ['raker', 'leviathan', 'orca'];
  return silhouettes[index % silhouettes.length];
}

function pickPersonality(): 'curious' | 'calm' | 'wanderer' {
  const r = Math.random();
  if (r < 0.34) return 'curious';
  if (r < 0.68) return 'calm';
  return 'wanderer';
}

function describePersonality(personality: WhaleAgent['personality']): string {
  if (personality === 'curious') return 'Curious';
  if (personality === 'calm') return 'Calm';
  return 'Wanderer';
}

function describeWhaleInteraction(whale: WhaleAgent, whales: WhaleAgent[], width: number, height: number): string {
  const interactionRadius = Math.min(width, height) * 0.19;
  const intimateRadius = interactionRadius * 0.58;
  const nearby: Array<{ whale: WhaleAgent; d: number }> = [];

  for (const other of whales) {
    if (other.id === whale.id) continue;
    const dx = other.x - whale.x;
    const dy = other.y - whale.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < interactionRadius) nearby.push({ whale: other, d });
  }

  if (!nearby.length) return 'Drifting solo in the deep, with no nearby resonance.';
  nearby.sort((a, b) => a.d - b.d);

  const intimate = nearby.filter((n) => n.d < intimateRadius);
  if (intimate.length >= 2) return `In close resonance with ${intimate.length} nearby whales, moving as one current.`;

  const closest = nearby[0];
  if (closest.d < intimateRadius) return `Sharing a low-frequency exchange with ${closest.whale.name}.`;
  if (nearby.length >= 2) return `Aligning direction with ${nearby.length} nearby whales.`;
  return `Slowly orienting toward ${closest.whale.name}.`;
}
function computeNeighborPull(
  whale: WhaleAgent,
  whales: WhaleAgent[],
  width: number,
  height: number
): { x: number; y: number; weight: number } {
  let sx = 0;
  let sy = 0;
  let total = 0;
  const radius = Math.min(width, height) * 0.34;

  for (const other of whales) {
    if (other.id === whale.id) continue;
    const dx = other.x - whale.x;
    const dy = other.y - whale.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1 && d < radius) {
      const w = 1 - d / radius;
      sx += (dx / d) * w;
      sy += (dy / d) * w;
      total += w;
    }
  }

  return { x: sx, y: sy, weight: clamp(total, 0, 1) };
}

function computeInteractionLinks(whales: WhaleAgent[], width: number, height: number): InteractionLink[] {
  const links: InteractionLink[] = [];
  const radius = Math.min(width, height) * 0.19;
  for (let i = 0; i < whales.length; i += 1) {
    for (let j = i + 1; j < whales.length; j += 1) {
      const a = whales[i];
      const b = whales[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < radius && d > 1) {
        const intensity = clamp(1 - d / radius, 0, 1);
        links.push({
          key: `${a.id}-${b.id}`,
          x: (a.x + b.x) * 0.5,
          y: (a.y + b.y) * 0.5,
          length: d,
          angle: Math.atan2(dy, dx),
          intensity,
        });
      }
    }
  }
  return links;
}

function withAlpha(rgba: string, alpha: number) {
  const m = rgba.match(/^rgba\((\d+),(\d+),(\d+),/);
  if (!m) return rgba;
  return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t, 0, 1);
}

function lerpAngle(a: number, b: number, t: number) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * clamp(t, 0, 1);
}

function angleDelta(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function serializeWhale(whale: WhaleAgent): PersistedWhaleState {
  return {
    id: whale.id,
    name: whale.name,
    isPlayer: whale.isPlayer,
    silhouette: whale.silhouette,
    species: whale.species,
    personality: whale.personality,
    tint: whale.tint,
    size: whale.size,
    depthScale: whale.depthScale,
    depthOpacity: whale.depthOpacity,
    x: whale.x,
    y: whale.y,
    heading: whale.heading,
    targetHeading: whale.targetHeading,
    speed: whale.speed,
    baseSpeed: whale.baseSpeed,
    targetSpeed: whale.targetSpeed,
    turnVelocity: whale.turnVelocity,
    turnFreq: whale.turnFreq,
    turnAmp: whale.turnAmp,
    wanderClock: whale.wanderClock,
    wanderInterval: whale.wanderInterval,
    phase: whale.phase,
    surgeFreq: whale.surgeFreq,
    surgeAmp: whale.surgeAmp,
    socialAffinity: whale.socialAffinity,
    calmness: whale.calmness,
    wanderJitter: whale.wanderJitter,
    roamX: whale.roamX,
    roamY: whale.roamY,
  };
}

function hydrateWhales(states: PersistedWhaleState[], width: number, height: number): WhaleAgent[] {
  return states.map((s, idx) => {
    const isPlayer = Boolean((s as any).isPlayer) || s.id === PLAYER_WHALE_ID;
    return {
      ...s,
      id: isPlayer ? PLAYER_WHALE_ID : s.id,
      name: (s as any).name || pickWhaleName(idx, isPlayer),
      silhouette: (s as any).silhouette || pickSilhouette(idx),
      isPlayer,
      x: clamp(s.x, 24, width - 24),
      y: clamp(s.y, 22, height - 22),
      xAnim: new Animated.Value(clamp(s.x, 24, width - 24)),
      yAnim: new Animated.Value(clamp(s.y, 22, height - 22)),
      angleAnim: new Animated.Value(s.heading),
      breathAnim: new Animated.Value(0.5 + 0.5 * Math.sin(s.phase)),
      tailAnim: new Animated.Value(0),
      bobAnim: new Animated.Value(0),
      opacityAnim: new Animated.Value(s.depthOpacity),
    };
  });
}

function fastForwardWhales(
  whales: WhaleAgent[],
  width: number,
  height: number,
  startClock: number,
  elapsedSeconds: number
): number {
  const elapsed = clamp(elapsedSeconds, 0, 60 * 60 * 8);
  if (elapsed <= 0.2) return startClock;

  // Coarse stepping: approximate elapsed behavior instead of simulating every frame.
  const steps = Math.min(140, Math.max(10, Math.round(elapsed / 2.8)));
  const dt = elapsed / steps;
  let simClock = startClock;
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  for (let i = 0; i < steps; i += 1) {
    simClock += dt;
    for (const w of whales) {
      w.wanderClock += dt;
      if (w.wanderClock >= w.wanderInterval) {
        w.wanderClock = 0;
        const jitterSeed = Math.sin(simClock * 0.41 + w.phase * 1.2 + Number(w.id.replace(/\D/g, '')) * 0.7);
        const speedSeed = Math.sin(simClock * 0.28 + w.phase * 0.9);
        w.targetHeading = w.heading + jitterSeed * w.wanderJitter * 0.84;
        w.targetSpeed = w.baseSpeed * (0.92 + (speedSeed + 1) * 0.09);
        w.wanderInterval = 4.8 + (Math.sin(simClock * 0.17 + w.phase) + 1) * (1.8 + w.calmness * 1.4);
        if (w.personality === 'wanderer') {
          const roamSeedX = (Math.sin(simClock * 0.12 + w.phase) + 1) * 0.5;
          const roamSeedY = (Math.sin(simClock * 0.1 + w.phase * 1.4 + 0.8) + 1) * 0.5;
          w.roamX = width * (0.08 + roamSeedX * 0.84);
          w.roamY = height * (0.08 + roamSeedY * 0.84);
        }
      }

      let desiredHeading = w.targetHeading + Math.sin(simClock * w.turnFreq + w.phase) * w.turnAmp * 0.62;
      const neighborPull = computeNeighborPull(w, whales, width, height);
      if (neighborPull.weight > 0) {
        const socialHeading = Math.atan2(neighborPull.y * Math.sign(w.socialAffinity), neighborPull.x * Math.sign(w.socialAffinity));
        desiredHeading = lerpAngle(desiredHeading, socialHeading, 0.06 * neighborPull.weight * Math.abs(w.socialAffinity));
      }
      if (w.personality === 'wanderer') {
        desiredHeading = lerpAngle(desiredHeading, Math.atan2(w.roamY - w.y, w.roamX - w.x), 0.06);
      }

      const marginX = 80;
      const marginY = 70;
      const edgePressureX =
        w.x < marginX ? (marginX - w.x) / marginX : w.x > width - marginX ? (w.x - (width - marginX)) / marginX : 0;
      const edgePressureY =
        w.y < marginY ? (marginY - w.y) / marginY : w.y > height - marginY ? (w.y - (height - marginY)) / marginY : 0;
      const edgePressure = Math.max(edgePressureX, edgePressureY);
      if (edgePressure > 0) {
        desiredHeading = lerpAngle(desiredHeading, Math.atan2(centerY - w.y, centerX - w.x), clamp(edgePressure * 0.72, 0, 0.85));
      }

      const turnError = angleDelta(w.heading, desiredHeading);
      w.turnVelocity += turnError * dt * (0.52 * (1 - w.calmness * 0.25));
      w.turnVelocity *= Math.exp(-dt * (1.55 + w.calmness * 0.5));
      w.turnVelocity = clamp(w.turnVelocity, -0.28, 0.28);
      w.heading += w.turnVelocity * dt * 0.9;

      const surge = 1 + Math.sin(simClock * w.surgeFreq + w.phase * 0.8) * w.surgeAmp;
      w.speed = lerp(w.speed, w.targetSpeed * surge * (1 - w.calmness * 0.18), dt * 0.3);
      w.x += Math.cos(w.heading) * w.speed * dt;
      w.y += Math.sin(w.heading) * w.speed * dt;
      w.x = clamp(w.x, 24, width - 24);
      w.y = clamp(w.y, 22, height - 22);
    }
  }

  return simClock;
}

function getLocalStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  const g: any = globalThis as any;
  return g?.localStorage ?? null;
}

async function readStoredWorld(): Promise<PersistedWorldState | null> {
  try {
    const storage = getLocalStorage();
    const raw = storage?.getItem(WORLD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWorldState;
    if (!parsed?.savedAt || !Array.isArray(parsed.whales)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeStoredWorld(payload: PersistedWorldState): Promise<void> {
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    storage.setItem(WORLD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

function WhaleSilhouette({
  whaleId,
  silhouette,
  tint,
  isPlayer,
}: {
  whaleId: string;
  silhouette: WhaleAgent['silhouette'];
  tint: string;
  isPlayer: boolean;
}) {
  const bodyGrad = `${whaleId}-body`;
  const backGrad = `${whaleId}-back`;
  const tailGrad = `${whaleId}-tail`;
  const headGlow = `${whaleId}-head`;
  const shape = SILHOUETTE_PATHS[silhouette];

  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet">
      <Defs>
        <SvgLinearGradient id={bodyGrad} x1="0.1" y1="0.4" x2="0.95" y2="0.62">
          <Stop offset="0%" stopColor={withAlpha(tint, 0.26)} />
          <Stop offset="56%" stopColor={withAlpha(tint, 0.62)} />
          <Stop offset="100%" stopColor={withAlpha(tint, 0.34)} />
        </SvgLinearGradient>
        <SvgLinearGradient id={backGrad} x1="0.2" y1="0.1" x2="0.8" y2="0.4">
          <Stop offset="0%" stopColor="rgba(220,246,255,0.34)" />
          <Stop offset="100%" stopColor="rgba(170,220,240,0)" />
        </SvgLinearGradient>
        <SvgLinearGradient id={tailGrad} x1="0.04" y1="0.5" x2="0.36" y2="0.5">
          <Stop offset="0%" stopColor={withAlpha(tint, 0.2)} />
          <Stop offset="100%" stopColor={withAlpha(tint, 0.46)} />
        </SvgLinearGradient>
        <SvgLinearGradient id={headGlow} x1="0.76" y1="0.46" x2="1" y2="0.52">
          <Stop offset="0%" stopColor="rgba(198,240,255,0.02)" />
          <Stop offset="100%" stopColor="rgba(224,250,255,0.26)" />
        </SvgLinearGradient>
      </Defs>

      <G>
        <Path d={shape.tail} fill={`url(#${tailGrad})`} />
        <Path d={shape.body} fill={`url(#${bodyGrad})`} />
        <Path d={shape.belly} fill="rgba(8,18,30,0.22)" />
        <Path d={shape.back} fill={`url(#${backGrad})`} />
        <Path d={shape.head} fill={`url(#${headGlow})`} />
        <Path d={shape.fin} fill="rgba(188,230,245,0.22)" />
        <Circle cx={shape.eye.cx} cy={shape.eye.cy} r={shape.eye.r} fill="rgba(215,240,248,0.4)" />
        {isPlayer ? <Path d={shape.playerMark} fill="rgba(200,242,255,0.35)" /> : null}
      </G>
    </Svg>
  );
}

const SILHOUETTE_PATHS: Record<
  WhaleAgent['silhouette'],
  {
    body: string;
    tail: string;
    belly: string;
    back: string;
    head: string;
    fin: string;
    playerMark: string;
    eye: { cx: number; cy: number; r: number };
  }
> = {
  // 1) Raker: long baleen-like profile, gently arched back, wide horizontal fluke.
  raker: {
    body:
      'M54 78 C72 50 122 30 184 32 C236 34 276 46 304 64 C318 73 317 88 303 98 C270 120 204 126 140 117 C92 110 64 98 54 88 Z',
    tail: 'M58 80 C38 56 12 47 6 61 C3 70 12 76 26 78 C13 80 3 87 6 97 C12 111 38 103 58 82 Z',
    belly: 'M60 88 C96 110 156 120 214 112 C188 122 144 125 104 116 C80 111 65 100 60 88 Z',
    back: 'M94 52 C138 32 210 33 266 52 C226 46 160 46 110 60 Z',
    head: 'M264 62 C286 66 300 73 303 81 C301 90 286 98 266 102 C278 92 279 74 264 62 Z',
    fin: 'M184 62 C196 48 206 48 212 64 C202 67 194 68 184 62 Z',
    playerMark: 'M218 52 C225 50 231 52 236 57 C230 59 224 59 218 52 Z',
    eye: { cx: 246, cy: 73, r: 1.7 },
  },
  // 2) Leviathan: heavier front mass with blunt head volume and deep torso.
  leviathan: {
    body:
      'M52 80 C70 55 116 42 172 42 C228 42 272 48 302 62 C316 69 318 86 304 98 C266 116 202 124 138 118 C92 112 66 100 52 90 Z',
    tail: 'M56 82 C38 62 16 58 8 68 C4 74 10 80 20 82 C10 84 4 90 8 98 C16 108 38 104 56 86 Z',
    belly: 'M60 90 C98 110 156 119 220 112 C190 123 142 127 104 118 C82 112 66 102 60 90 Z',
    back: 'M96 56 C142 44 214 43 274 56 C228 55 166 57 112 66 Z',
    head: 'M252 58 C282 58 298 64 306 74 C302 86 286 95 258 100 C270 88 270 70 252 58 Z',
    fin: 'M164 64 C174 47 184 48 190 66 C180 69 172 70 164 64 Z',
    playerMark: 'M206 54 C214 52 222 54 228 60 C220 62 212 61 206 54 Z',
    eye: { cx: 240, cy: 72, r: 1.8 },
  },
  // 3) Orca: sharper hydrodynamic line and a prominent upright dorsal silhouette.
  orca: {
    body:
      'M56 82 C76 58 122 42 182 41 C232 42 270 52 296 68 C310 76 309 90 296 100 C262 121 194 126 130 118 C88 112 64 100 56 90 Z',
    tail: 'M60 83 C40 60 15 52 8 64 C5 71 12 78 24 80 C12 82 5 88 8 98 C15 109 40 103 60 85 Z',
    belly: 'M62 92 C102 112 164 121 224 111 C196 123 146 126 106 117 C82 111 66 101 62 92 Z',
    back: 'M102 56 C146 39 212 40 268 56 C228 51 166 52 116 64 Z',
    head: 'M266 64 C286 67 298 74 301 82 C298 90 286 97 268 100 C278 91 279 74 266 64 Z',
    fin: 'M196 58 C206 22 218 22 224 62 C214 63 206 63 196 58 Z',
    playerMark: 'M224 54 C231 52 238 54 243 59 C236 61 229 61 224 54 Z',
    eye: { cx: 248, cy: 74, r: 1.6 },
  },
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050913',
    overflow: 'hidden',
  },
  lightRayLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
  },
  ray: {
    position: 'absolute',
    width: 200,
    height: '130%',
    backgroundColor: 'rgba(120,170,210,0.08)',
    borderRadius: 260,
    transform: [{ rotate: '-14deg' }],
  },
  ray1: {
    left: '9%',
    top: '-14%',
  },
  ray2: {
    left: '44%',
    top: '-18%',
    opacity: 0.8,
  },
  ray3: {
    left: '72%',
    top: '-12%',
    opacity: 0.68,
  },
  particle: {
    position: 'absolute',
    borderRadius: 20,
    backgroundColor: 'rgba(164,225,252,0.72)',
  },
  interactionBridgeWrap: {
    position: 'absolute',
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  interactionBridge: {
    width: '100%',
    height: 1.5,
    borderRadius: 999,
  },
  interactionCore: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(186,234,255,0.28)',
    shadowColor: '#BDEBFF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
  },
  worldLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  whaleHitbox: {
    position: 'absolute',
  },
  whaleWrap: {
    position: 'absolute',
  },
  silhouetteShell: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  whaleAura: {
    position: 'absolute',
    width: '132%',
    height: '176%',
    left: '-14%',
    top: '-34%',
    borderRadius: 999,
    shadowColor: '#88D2EF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 4,
  },
  playerWhaleAura: {
    position: 'absolute',
    width: '142%',
    height: '188%',
    left: '-19%',
    top: '-38%',
    borderRadius: 999,
    backgroundColor: 'rgba(172,232,255,0.08)',
    shadowColor: '#BEEBFF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 22,
  },
  whaleShadow: {
    position: 'absolute',
    width: '74%',
    height: '22%',
    right: '12%',
    top: '58%',
    borderRadius: 999,
    backgroundColor: 'rgba(3,8,14,0.24)',
  },
  bodyShell: {
    position: 'absolute',
    width: '82%',
    height: '70%',
    right: '4%',
    top: '15%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 90,
    borderBottomRightRadius: 62,
    overflow: 'hidden',
  },
  bodyShellHump: {
    width: '82%',
    height: '72%',
    right: '4%',
    top: '14%',
    borderBottomLeftRadius: 96,
    borderBottomRightRadius: 64,
  },
  bodyShellLong: {
    width: '86%',
    height: '64%',
    right: '2%',
    top: '18%',
    borderBottomLeftRadius: 74,
    borderBottomRightRadius: 52,
  },
  bodyFill: {
    ...StyleSheet.absoluteFillObject,
  },
  backHighlight: {
    position: 'absolute',
    width: '74%',
    height: '30%',
    right: '14%',
    top: '10%',
    borderRadius: 999,
  },
  underShade: {
    position: 'absolute',
    width: '84%',
    height: '34%',
    right: '10%',
    top: '56%',
    borderTopLeftRadius: 70,
    borderTopRightRadius: 56,
    borderBottomLeftRadius: 64,
    borderBottomRightRadius: 48,
  },
  tailAssembly: {
    position: 'absolute',
    width: '30%',
    height: '52%',
    left: '0%',
    top: '30%',
  },
  tailAssemblyHump: {
    width: '31%',
    left: '0%',
    top: '30%',
  },
  tailAssemblyLong: {
    width: '28%',
    left: '-1%',
    top: '32%',
  },
  peduncle: {
    position: 'absolute',
    width: '42%',
    height: '42%',
    right: '2%',
    top: '28%',
    borderRadius: 999,
  },
  flukeTop: {
    position: 'absolute',
    width: '40%',
    height: '34%',
    left: '2%',
    top: '14%',
    borderRadius: 999,
    transform: [{ rotate: '-22deg' }],
  },
  flukeBottom: {
    position: 'absolute',
    width: '40%',
    height: '34%',
    left: '2%',
    top: '50%',
    borderRadius: 999,
    transform: [{ rotate: '22deg' }],
  },
  flukeCut: {
    position: 'absolute',
    width: '9%',
    height: '15%',
    left: '29%',
    top: '43%',
    borderRadius: 999,
    backgroundColor: 'rgba(3,9,15,0.42)',
  },
  flukeCutHump: {
    width: '9%',
    left: '29%',
  },
  flukeCutLong: {
    width: '8%',
    left: '27%',
  },
  dorsalFin: {
    position: 'absolute',
    width: '7%',
    height: '14%',
    left: '53%',
    top: '22%',
    borderRadius: 999,
    backgroundColor: 'rgba(175,224,244,0.14)',
    transform: [{ rotate: '-20deg' }],
  },
  dorsalFinHump: {
    width: '8%',
    left: '53%',
    top: '22%',
    transform: [{ rotate: '-20deg' }],
  },
  dorsalFinLong: {
    width: '6%',
    left: '56%',
    top: '26%',
    transform: [{ rotate: '-14deg' }],
  },
  pectoralFin: {
    position: 'absolute',
    width: '12%',
    height: '13%',
    left: '50%',
    top: '56%',
    borderRadius: 999,
    backgroundColor: 'rgba(126,186,218,0.14)',
    transform: [{ rotate: '20deg' }],
  },
  pectoralFinHump: {
    width: '12%',
    left: '50%',
    top: '56%',
    transform: [{ rotate: '20deg' }],
  },
  pectoralFinLong: {
    width: '14%',
    left: '48%',
    top: '58%',
    transform: [{ rotate: '16deg' }],
  },
  snout: {
    position: 'absolute',
    width: '12%',
    height: '24%',
    right: '0%',
    top: '33%',
    borderRadius: 999,
    backgroundColor: 'rgba(216,246,255,0.3)',
  },
  snoutHump: {
    width: '12%',
    right: '0%',
    top: '33%',
  },
  snoutLong: {
    width: '10%',
    right: '-1%',
    top: '36%',
  },
  eye: {
    position: 'absolute',
    width: 2.4,
    height: 2.4,
    right: '28%',
    top: '37%',
    borderRadius: 99,
    backgroundColor: 'rgba(214,236,246,0.34)',
  },
  eyeHump: {
    right: '28%',
    top: '37%',
  },
  eyeLong: {
    right: '30%',
    top: '40%',
  },
  playerWhaleMark: {
    position: 'absolute',
    width: 3.2,
    height: 3.2,
    right: '24%',
    top: '31%',
    borderRadius: 99,
    backgroundColor: 'rgba(210,244,255,0.5)',
    shadowColor: '#C9F2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
  },
  wakeGlow: {
    position: 'absolute',
    width: '34%',
    height: '16%',
    left: '-12%',
    top: '43%',
    borderRadius: 999,
  },
  whaleInfoWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 26,
    alignItems: 'center',
  },
  whaleInfoCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168,218,238,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#9ED8F2',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
  },
  whaleInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  whaleInfoName: {
    fontSize: 15,
    letterSpacing: 0.6,
    fontWeight: '400',
    color: 'rgba(226,246,255,0.92)',
  },
  whaleInfoClose: {
    fontSize: 11,
    letterSpacing: 0.9,
    fontWeight: '300',
    color: 'rgba(190,225,240,0.58)',
  },
  whaleInfoPersonality: {
    marginTop: 5,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '300',
    color: 'rgba(183,216,232,0.72)',
  },
  whaleInfoInteraction: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.35,
    fontWeight: '300',
    color: 'rgba(214,240,250,0.84)',
  },
  myWhalesWrap: {
    position: 'absolute',
    right: 16,
    top: 36,
    width: 226,
    alignItems: 'flex-end',
  },
  myWhalesToggleRow: {
    width: 98,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  myWhalesLabel: {
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: '300',
    color: 'rgba(200,229,242,0.6)',
  },
  myWhalesToggleGlyph: {
    fontSize: 12,
    fontWeight: '300',
    color: 'rgba(188,222,238,0.62)',
    marginTop: -1,
  },
  myWhalesPanel: {
    marginTop: 7,
    overflow: 'hidden',
    width: '100%',
  },
  myWhalesCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(161,214,236,0.18)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  myWhaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  myWhaleDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    marginRight: 8,
  },
  myWhaleTextGroup: {
    flex: 1,
  },
  myWhaleName: {
    fontSize: 13,
    letterSpacing: 0.45,
    fontWeight: '300',
    color: 'rgba(223,245,254,0.9)',
  },
  myWhaleMeta: {
    marginTop: 1,
    fontSize: 10,
    letterSpacing: 0.7,
    fontWeight: '300',
    color: 'rgba(177,211,228,0.65)',
  },
  myWhaleState: {
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '300',
    color: 'rgba(187,221,236,0.66)',
  },
  myWhaleReleaseBtn: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(170,220,238,0.14)',
    paddingTop: 7,
    alignItems: 'flex-end',
  },
  myWhaleReleaseText: {
    fontSize: 10,
    letterSpacing: 0.9,
    fontWeight: '300',
    color: 'rgba(197,230,244,0.62)',
  },
  bgmWrap: {
    position: 'absolute',
    left: 18,
    top: 36,
    width: 210,
  },
  bgmToggleRow: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bgmLabel: {
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '300',
    color: 'rgba(206,230,242,0.62)',
  },
  bgmToggleGlyph: {
    fontSize: 12,
    fontWeight: '300',
    color: 'rgba(188,222,238,0.62)',
    marginTop: -1,
  },
  bgmPanel: {
    marginTop: 7,
    overflow: 'hidden',
  },
  bgmTrackHitbox: {
    width: BGM_TRACK_WIDTH + 16,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  bgmTrackBase: {
    position: 'absolute',
    left: 8,
    width: BGM_TRACK_WIDTH,
    height: 1,
    backgroundColor: 'rgba(188,223,242,0.22)',
  },
  bgmTrackActive: {
    position: 'absolute',
    left: 8,
    height: 1,
    backgroundColor: 'rgba(206,239,252,0.72)',
  },
  bgmThumb: {
    position: 'absolute',
    left: 7,
    width: 3,
    height: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(222,246,255,0.88)',
    shadowColor: '#A5E4FB',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
  },
  bgmValue: {
    marginTop: 5,
    fontSize: 10,
    letterSpacing: 0.8,
    color: 'rgba(185,214,230,0.44)',
    fontWeight: '300',
  },
  trackTitle: {
    marginTop: 10,
    fontSize: 13,
    letterSpacing: 0.9,
    color: 'rgba(224,244,252,0.84)',
    fontWeight: '300',
    width: 190,
  },
  transportRow: {
    marginTop: 8,
    width: 136,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transportBtn: {
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  transportText: {
    fontSize: 10,
    letterSpacing: 1.1,
    color: 'rgba(187,216,232,0.62)',
    fontWeight: '300',
  },
  topTitleWrap: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  topTitleText: {
    fontSize: 18,
    letterSpacing: 1.6,
    fontWeight: '300',
    color: 'rgba(205,230,244,0.58)',
    textShadowColor: 'rgba(118,186,220,0.12)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
});


