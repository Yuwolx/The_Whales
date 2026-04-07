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
  speed: number;
  cruiseSpeed: number;
  turnRate: number;
  displayBank: number;
  faceDir: 1 | -1;
  bellyFlip: number;
  bellyUp: boolean;
  bellyClock: number;
  bellyDuration: number;
  bellyCooldown: number;
  phase: number;
  tailPhase: number;
  tailFreq: number;
  tailAmp: number;
  bodyWaveAmp: number;
  bodyWaveFreq: number;
  thrustGain: number;
  steerResponsiveness: number;
  inertia: number;
  socialAffinity: number;
  calmness: number;
  state: 'calm' | 'active' | 'wandering' | 'drifting' | 'curious';
  action: 'approach' | 'align' | 'circle' | 'drift_away' | 'ignore';
  energy: number;
  nearbyDensity: number;
  actionClock: number;
  actionDuration: number;
  actionTargetId: string | null;
  orbitDir: 1 | -1;
  stateClock: number;
  stateInterval: number;
  roamClock: number;
  roamInterval: number;
  roamX: number;
  roamY: number;
  xAnim: Animated.Value;
  yAnim: Animated.Value;
  angleAnim: Animated.Value;
  faceAnim: Animated.Value;
  bellyAnim: Animated.Value;
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
  'xAnim' | 'yAnim' | 'angleAnim' | 'faceAnim' | 'bellyAnim' | 'breathAnim' | 'tailAnim' | 'bobAnim' | 'opacityAnim'
>;

type PersistedWorldState = {
  savedAt: number;
  simClock: number;
  whales: PersistedWhaleState[];
};

const WHALE_COUNT = 6;
const PARTICLE_COUNT = 38;
const BGM_TRACK_WIDTH = 116;
const WORLD_STORAGE_KEY = 'the_whales_world_v2';
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

      stepWhalesMotion(whales, width, height, dt, simT, true);

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
          inputRange: [-0.26, 0.26],
          outputRange: ['-0.26rad', '0.26rad'],
          extrapolate: 'clamp',
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
                  { scaleX: w.faceAnim },
                  { rotateZ: bodyRoll },
                  { rotate },
                  { scale: breatheScale },
                ],
              },
            ]}
          >
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

    let cruiseSpeed = randomRange(3.8, 7.2) * depthScale;
    let tailFreq = randomRange(0.54, 0.92);
    let tailAmp = randomRange(0.34, 0.58);
    let bodyWaveAmp = randomRange(2.8, 6.4);
    let bodyWaveFreq = randomRange(0.28, 0.58);
    let thrustGain = randomRange(0.9, 1.7);
    let steerResponsiveness = randomRange(0.36, 0.62);
    let inertia = randomRange(1.8, 2.6);
    let socialAffinity = 1;
    let calmness = 0.3;
    let roamInterval = randomRange(5.0, 10.0);

    if (personality === 'curious') {
      cruiseSpeed *= randomRange(1.02, 1.10);
      tailFreq *= randomRange(1.02, 1.10);
      bodyWaveAmp *= randomRange(1.02, 1.12);
      socialAffinity = randomRange(1.25, 1.55);
      calmness = randomRange(0.18, 0.34);
      steerResponsiveness *= randomRange(1.04, 1.12);
      inertia *= randomRange(0.88, 0.98);
      roamInterval *= randomRange(0.76, 0.88);
    } else if (personality === 'calm') {
      cruiseSpeed *= randomRange(0.72, 0.86);
      tailFreq *= randomRange(0.74, 0.88);
      bodyWaveAmp *= randomRange(0.68, 0.82);
      socialAffinity = randomRange(0.86, 1.05);
      calmness = randomRange(0.76, 0.94);
      steerResponsiveness *= randomRange(0.62, 0.78);
      inertia *= randomRange(1.22, 1.42);
      roamInterval *= randomRange(1.12, 1.32);
    } else {
      // wanderer
      cruiseSpeed *= randomRange(0.88, 1.0);
      tailFreq *= randomRange(0.88, 1.02);
      bodyWaveAmp *= randomRange(0.88, 1.06);
      socialAffinity = randomRange(-1.35, -0.95);
      calmness = randomRange(0.3, 0.5);
      steerResponsiveness *= randomRange(0.88, 1.0);
      inertia *= randomRange(1.08, 1.22);
      roamInterval *= randomRange(0.88, 1.04);
    }

    if (isPlayer) {
      cruiseSpeed *= 0.96;
      socialAffinity = 1.08;
      calmness = 0.58;
      bodyWaveAmp *= 1.04;
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
      speed: cruiseSpeed,
      cruiseSpeed,
      turnRate: randomRange(-0.1, 0.1),
      displayBank: 0,
      faceDir: Math.cos(heading) >= 0 ? 1 : -1,
      bellyFlip: 1,
      bellyUp: false,
      bellyClock: 0,
      bellyDuration: 0,
      bellyCooldown: randomRange(14, 28),
      phase: Math.random() * Math.PI * 2,
      tailPhase: Math.random() * Math.PI * 2,
      tailFreq,
      tailAmp,
      bodyWaveAmp,
      bodyWaveFreq,
      thrustGain,
      steerResponsiveness,
      inertia,
      socialAffinity,
      calmness,
      state: initialStateForPersonality(personality),
      action: 'ignore',
      energy: randomRange(0.5, 0.9),
      nearbyDensity: 0,
      actionClock: randomRange(0, 1.8),
      actionDuration: randomRange(2.2, 4.8),
      actionTargetId: null,
      orbitDir: Math.random() < 0.5 ? -1 : 1,
      stateClock: randomRange(0, 2.1),
      stateInterval: randomRange(2.8, 5.6),
      roamClock: Math.random() * 3,
      roamInterval,
      roamX: randomRange(width * 0.08, width * 0.92),
      roamY: randomRange(height * 0.08, height * 0.92),
      xAnim: new Animated.Value(x),
      yAnim: new Animated.Value(y),
      angleAnim: new Animated.Value(0),
      faceAnim: new Animated.Value(Math.cos(heading) >= 0 ? 1 : -1),
      bellyAnim: new Animated.Value(1),
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

function initialStateForPersonality(
  personality: WhaleAgent['personality']
): WhaleAgent['state'] {
  if (personality === 'curious') return 'curious';
  if (personality === 'calm') return 'calm';
  return 'wandering';
}

function coerceState(value: unknown, fallback: WhaleAgent['state']): WhaleAgent['state'] {
  if (value === 'calm' || value === 'active' || value === 'wandering' || value === 'drifting' || value === 'curious') {
    return value;
  }
  return fallback;
}

function coerceAction(value: unknown, fallback: WhaleAgent['action']): WhaleAgent['action'] {
  if (value === 'approach' || value === 'align' || value === 'circle' || value === 'drift_away' || value === 'ignore') {
    return value;
  }
  return fallback;
}

function describePersonality(personality: WhaleAgent['personality']): string {
  if (personality === 'curious') return 'Curious';
  if (personality === 'calm') return 'Calm';
  return 'Wanderer';
}

function describeWhaleInteraction(whale: WhaleAgent, whales: WhaleAgent[], width: number, height: number): string {
  const interactionRadius = Math.min(width, height) * 0.19;
  const intimateRadius = interactionRadius * 0.56;
  const nearby: Array<{ whale: WhaleAgent; d: number }> = [];

  for (const other of whales) {
    if (other.id === whale.id) continue;
    const dx = other.x - whale.x;
    const dy = other.y - whale.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < interactionRadius) nearby.push({ whale: other, d });
  }

  if (!nearby.length) {
    if (whale.state === 'drifting') return 'Holding a long drift pattern in open water.';
    if (whale.state === 'wandering') return 'Tracing a quiet roaming arc away from the group.';
    return 'Moving alone in a low-density current.';
  }
  nearby.sort((a, b) => a.d - b.d);

  const intimate = nearby.filter((n) => n.d < intimateRadius);
  if (intimate.length >= 2) {
    if (whale.action === 'align') return `Aligned with ${intimate.length} nearby whales in a shared flow.`;
    if (whale.action === 'circle') return `Circling softly within a cluster of ${intimate.length} whales.`;
    return `In close resonance with ${intimate.length} nearby whales.`;
  }
  const closest = nearby[0];
  if (closest.d < intimateRadius) {
    if (whale.action === 'approach') return `Closing distance with ${closest.whale.name}.`;
    if (whale.action === 'drift_away') return `Easing away after a brief encounter with ${closest.whale.name}.`;
    return `Sharing a subtle exchange with ${closest.whale.name}.`;
  }
  if (nearby.length >= 2) return `Sensing ${nearby.length} nearby whales and adjusting heading.`;
  return `Tracking ${closest.whale.name} at the edge of perception.`;
}
function stepWhalesMotion(
  whales: WhaleAgent[],
  width: number,
  height: number,
  dt: number,
  simT: number,
  updateAnims: boolean
) {
  const marginX = Math.max(64, width * 0.12);
  const marginY = Math.max(58, height * 0.1);
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  for (const w of whales) {
    const sensed = senseNearbyWhales(w, whales, width, height);
    w.nearbyDensity = lerp(w.nearbyDensity, sensed.density, dt * 1.8);

    w.stateClock += dt;
    if (w.stateClock >= w.stateInterval) {
      w.stateClock = 0;
      w.stateInterval = randomRange(2.6, 5.8);
      w.state = chooseNextState(w);
    }

    w.actionClock += dt;
    const currentTarget =
      (w.actionTargetId ? whales.find((other) => other.id === w.actionTargetId) : null) ??
      sensed.neighbors[0]?.whale ??
      null;
    const actionExpired = w.actionClock >= w.actionDuration;
    const actionNeedsTarget = (w.action === 'approach' || w.action === 'align' || w.action === 'circle' || w.action === 'drift_away') && !currentTarget;
    if (actionExpired || actionNeedsTarget) {
      const nextAction = chooseNextAction(w, sensed.neighbors);
      w.action = nextAction.action;
      w.actionTargetId = nextAction.targetId;
      w.actionDuration = nextAction.duration;
      w.actionClock = 0;
      w.orbitDir = Math.random() < 0.5 ? -1 : 1;
    }

    const activityLoad =
      w.state === 'active' ? 0.05 : w.state === 'curious' ? 0.036 : w.state === 'wandering' ? 0.026 : 0.014;
    const recharge = w.state === 'calm' || w.state === 'drifting' ? 0.044 : 0.012;
    const socialRecovery = w.nearbyDensity * (w.action === 'align' || w.action === 'approach' ? 0.03 : 0.012);
    w.energy = clamp(w.energy + (recharge + socialRecovery - activityLoad) * dt, 0.08, 1);

    w.roamClock += dt;
    if (w.roamClock >= w.roamInterval) {
      w.roamClock = 0;
      w.roamInterval = randomRange(4.2, 8.4) * (1 + w.calmness * 0.24);
      if (w.personality === 'wanderer' || Math.random() < 0.38) {
        w.roamX = randomRange(width * 0.06, width * 0.94);
        w.roamY = randomRange(height * 0.08, height * 0.92);
      }
    }

    const flowHeading = computeFlowHeading(w, width, height, simT);
    let desiredHeading = flowHeading;
    let targetSpeed =
      w.cruiseSpeed *
      (w.state === 'active'
        ? 0.98
        : w.state === 'curious'
          ? 0.9
          : w.state === 'wandering'
            ? 0.84
            : w.state === 'drifting'
              ? 0.66
              : 0.74);

    const targetWhale = w.actionTargetId
      ? whales.find((other) => other.id === w.actionTargetId) ?? null
      : sensed.neighbors[0]?.whale ?? null;
    const distanceToTarget = targetWhale
      ? Math.sqrt((targetWhale.x - w.x) ** 2 + (targetWhale.y - w.y) ** 2)
      : Number.POSITIVE_INFINITY;

    if (targetWhale) {
      const toTarget = Math.atan2(targetWhale.y - w.y, targetWhale.x - w.x);
      if (w.action === 'approach') {
        desiredHeading = lerpAngle(desiredHeading, toTarget, 0.68);
        targetSpeed = w.cruiseSpeed * (0.86 + 0.18 * w.energy);
      } else if (w.action === 'align') {
        desiredHeading = lerpAngle(desiredHeading, targetWhale.heading, 0.62);
        targetSpeed = lerp(targetSpeed, targetWhale.speed, 0.35);
      } else if (w.action === 'circle') {
        const desiredRadius = Math.min(width, height) * 0.1;
        const tangent = toTarget + w.orbitDir * Math.PI * 0.5;
        const radiusError = clamp((distanceToTarget - desiredRadius) / desiredRadius, -1, 1);
        desiredHeading = lerpAngle(desiredHeading, tangent + radiusError * 0.36, 0.74);
        targetSpeed = w.cruiseSpeed * (0.7 + (1 - w.calmness) * 0.08);
      } else if (w.action === 'drift_away') {
        const away = Math.atan2(w.y - targetWhale.y, w.x - targetWhale.x);
        desiredHeading = lerpAngle(desiredHeading, away, 0.72);
        targetSpeed = w.cruiseSpeed * 0.76;
      }
    }

    if (w.action === 'ignore') {
      if (w.personality === 'wanderer' || w.state === 'wandering') {
        const roamHeading = Math.atan2(w.roamY - w.y, w.roamX - w.x);
        desiredHeading = lerpAngle(desiredHeading, roamHeading, 0.42);
      } else if (sensed.neighbors[0]) {
        const neighborHeading = sensed.neighbors[0].whale.heading;
        desiredHeading = lerpAngle(desiredHeading, neighborHeading, 0.18);
      }
    }

    if (!targetWhale && w.personality !== 'wanderer') {
      const roamHeading = Math.atan2(w.roamY - w.y, w.roamX - w.x);
      desiredHeading = lerpAngle(desiredHeading, roamHeading, 0.2);
    }

    const edgePressureX =
      w.x < marginX ? (marginX - w.x) / marginX : w.x > width - marginX ? (w.x - (width - marginX)) / marginX : 0;
    const edgePressureY =
      w.y < marginY ? (marginY - w.y) / marginY : w.y > height - marginY ? (w.y - (height - marginY)) / marginY : 0;
    const edgePressure = Math.max(edgePressureX, edgePressureY);
    if (edgePressure > 0) {
      const toCenter = Math.atan2(centerY - w.y, centerX - w.x);
      desiredHeading = lerpAngle(desiredHeading, toCenter, clamp(edgePressure * 0.9, 0, 0.96));
      targetSpeed = Math.max(targetSpeed, w.cruiseSpeed * 0.82);
    }

    w.tailPhase += dt * w.tailFreq * (0.58 + (w.speed / Math.max(w.cruiseSpeed, 0.001)) * 0.42);
    const tailSwing = Math.sin(w.tailPhase) * w.tailAmp;
    const thrust = (0.35 + Math.abs(tailSwing) * 0.65) * w.thrustGain * 0.26;
    const microPulse = Math.sin(simT * 0.24 + w.phase * 0.8) * 0.05 + Math.sin(simT * 0.11 + w.phase * 1.7) * 0.03;
    const speedGoal = targetSpeed * (0.92 + microPulse);
    w.speed += (speedGoal + thrust - w.speed) * dt * (0.34 + (1 - w.calmness) * 0.14);
    w.speed = clamp(w.speed, w.cruiseSpeed * 0.4, w.cruiseSpeed * 1.08);

    const headingError = angleDelta(w.heading, desiredHeading);
    const turnAccel = headingError * w.steerResponsiveness - w.turnRate * (1.08 + w.inertia * 0.48);
    w.turnRate += turnAccel * dt;
    w.turnRate = clamp(w.turnRate, -0.28, 0.28);
    w.heading += w.turnRate * dt;

    const lateralWave = Math.sin(w.tailPhase * 0.56 + simT * w.bodyWaveFreq + w.phase) * w.bodyWaveAmp;
    const curvatureBias = Math.sin(simT * 0.12 + w.phase * 0.9) * 0.08;
    const fwdHeading = w.heading + curvatureBias;
    const fwdX = Math.cos(fwdHeading);
    const fwdY = Math.sin(fwdHeading);
    const sideX = -fwdY;
    const sideY = fwdX;
    w.x += fwdX * w.speed * dt + sideX * lateralWave * dt * 0.28;
    w.y += fwdY * w.speed * dt + sideY * lateralWave * dt * 0.28;
    w.x = clamp(w.x, 20, width - 20);
    w.y = clamp(w.y, 18, height - 18);

    w.bellyCooldown -= dt;
    const playfulRollChance = w.state === 'active' ? 0.00055 : 0.00022;
    if (!w.bellyUp && w.bellyCooldown <= 0 && Math.random() < dt * playfulRollChance) {
      w.bellyUp = true;
      w.bellyClock = 0;
      w.bellyDuration = randomRange(0.8, 1.4);
    }
    if (w.bellyUp) {
      w.bellyClock += dt;
      if (w.bellyClock >= w.bellyDuration) {
        w.bellyUp = false;
        w.bellyClock = 0;
        w.bellyCooldown = randomRange(90, 220);
      }
    }
    const bellyTarget = w.bellyUp ? -1 : 1;
    w.bellyFlip = lerp(w.bellyFlip, bellyTarget, dt * (w.bellyUp ? 0.74 : 0.44));
    w.faceDir = Math.cos(w.heading) >= 0 ? 1 : -1;
    const desiredBank = clamp(w.turnRate * 0.56 + tailSwing * 0.04, -0.2, 0.2);
    w.displayBank = lerp(w.displayBank, desiredBank, dt * 1.7);

    if (updateAnims) {
      const breathe = 0.5 + 0.5 * Math.sin(simT * (0.24 + w.energy * 0.14) + w.phase * 1.25);
      const bob = Math.sin(w.tailPhase * 0.42 + w.phase * 0.9) * (0.68 + w.tailAmp * 0.38);
      const opacityPulse = 0.5 + 0.5 * Math.sin(simT * 0.24 + w.phase * 0.66);
      w.xAnim.setValue(w.x);
      w.yAnim.setValue(w.y);
      w.angleAnim.setValue(w.displayBank);
      w.faceAnim.setValue(w.faceDir);
      w.bellyAnim.setValue(w.bellyFlip);
      w.breathAnim.setValue(breathe);
      w.tailAnim.setValue(tailSwing);
      w.bobAnim.setValue(bob);
      w.opacityAnim.setValue(w.depthOpacity * (0.82 + opacityPulse * 0.2));
    }
  }
}

function senseNearbyWhales(
  whale: WhaleAgent,
  whales: WhaleAgent[],
  width: number,
  height: number
): {
  neighbors: Array<{ whale: WhaleAgent; distance: number }>;
  density: number;
} {
  const radius = Math.min(width, height) * 0.28;
  const neighbors: Array<{ whale: WhaleAgent; distance: number }> = [];
  let density = 0;

  for (const other of whales) {
    if (other.id === whale.id) continue;
    const dx = other.x - whale.x;
    const dy = other.y - whale.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1 || d > radius) continue;
    neighbors.push({ whale: other, distance: d });
    density += 1 - d / radius;
  }

  neighbors.sort((a, b) => a.distance - b.distance);
  return {
    neighbors,
    density: clamp(density / 3.2, 0, 1),
  };
}

function chooseNextState(whale: WhaleAgent): WhaleAgent['state'] {
  const weights: Record<WhaleAgent['state'], number> = {
    calm: 0.18,
    active: 0.16,
    wandering: 0.2,
    drifting: 0.2,
    curious: 0.18,
  };

  if (whale.energy < 0.34) {
    weights.calm += 0.44;
    weights.drifting += 0.36;
    weights.active *= 0.48;
  } else if (whale.energy > 0.72) {
    weights.active += 0.34;
    weights.curious += 0.26;
  }

  if (whale.nearbyDensity > 0.58) {
    weights.curious += 0.34;
    weights.active += 0.2;
    weights.wandering *= 0.72;
  } else if (whale.nearbyDensity < 0.22) {
    weights.wandering += 0.28;
    weights.drifting += 0.2;
  }

  if (whale.personality === 'curious') {
    weights.curious += 0.34;
    weights.active += 0.12;
  } else if (whale.personality === 'calm') {
    weights.calm += 0.34;
    weights.drifting += 0.22;
  } else {
    weights.wandering += 0.38;
    weights.drifting += 0.12;
  }

  return weightedChoice(weights, whale.state);
}

function chooseNextAction(
  whale: WhaleAgent,
  neighbors: Array<{ whale: WhaleAgent; distance: number }>
): { action: WhaleAgent['action']; targetId: string | null; duration: number } {
  const closest = neighbors[0]?.whale ?? null;
  const weights: Record<WhaleAgent['action'], number> = {
    approach: 0.15,
    align: 0.18,
    circle: 0.12,
    drift_away: 0.15,
    ignore: 0.2,
  };

  if (!closest) {
    weights.ignore += 0.56;
    weights.drift_away += 0.22;
    weights.approach *= 0.08;
    weights.align *= 0.12;
    weights.circle *= 0.1;
  } else {
    const closeness = clamp(1 - neighbors[0].distance / 180, 0, 1);
    weights.approach += closeness * (0.36 + Math.max(whale.socialAffinity, 0) * 0.26);
    weights.align += closeness * 0.42;
    weights.circle += closeness * 0.24;
    weights.drift_away += Math.max(-whale.socialAffinity, 0) * 0.44;
  }

  if (whale.state === 'curious') {
    weights.approach += 0.3;
    weights.circle += 0.18;
  } else if (whale.state === 'active') {
    weights.approach += 0.22;
    weights.align += 0.2;
  } else if (whale.state === 'drifting') {
    weights.drift_away += 0.28;
    weights.ignore += 0.24;
  } else if (whale.state === 'wandering') {
    weights.ignore += 0.26;
    weights.drift_away += 0.2;
  } else if (whale.state === 'calm') {
    weights.align += 0.2;
    weights.ignore += 0.24;
  }

  if (whale.personality === 'wanderer') {
    weights.drift_away += 0.28;
    weights.approach *= 0.72;
    weights.circle *= 0.78;
  } else if (whale.personality === 'calm') {
    weights.ignore += 0.18;
    weights.align += 0.18;
  } else {
    weights.approach += 0.18;
  }

  if (whale.energy < 0.28) {
    weights.ignore += 0.44;
    weights.drift_away += 0.24;
    weights.approach *= 0.68;
  }

  const action = weightedChoice<WhaleAgent['action']>(weights, 'ignore');
  const targetId =
    action === 'approach' || action === 'align' || action === 'circle' || action === 'drift_away'
      ? closest?.id ?? null
      : null;
  const durationBase =
    action === 'circle' ? randomRange(2.4, 4.6) : action === 'align' ? randomRange(2.2, 4.1) : randomRange(1.8, 3.8);
  const duration = durationBase * (1 + whale.calmness * 0.4);

  return { action, targetId, duration };
}

function weightedChoice<T extends string>(weights: Record<T, number>, fallback: T): T {
  let total = 0;
  const entries = Object.entries(weights) as Array<[T, number]>;
  for (const [, weight] of entries) {
    total += Math.max(weight, 0);
  }
  if (total <= 0.00001) return fallback;

  let cursor = Math.random() * total;
  for (const [key, weight] of entries) {
    cursor -= Math.max(weight, 0);
    if (cursor <= 0) return key;
  }
  return fallback;
}

function computeFlowHeading(whale: WhaleAgent, width: number, height: number, simT: number): number {
  const nx = whale.x / Math.max(width, 1);
  const ny = whale.y / Math.max(height, 1);
  const a = Math.sin(nx * 6.2 + simT * 0.19 + whale.phase * 0.8);
  const b = Math.cos(ny * 5.8 - simT * 0.16 + whale.phase * 1.1);
  const c = Math.sin((nx + ny) * 4.2 + simT * 0.12);
  return Math.atan2(b + c * 0.42, a + c * 0.36);
}

function computeSocialSteer(
  whale: WhaleAgent,
  whales: WhaleAgent[],
  width: number,
  height: number
): { heading: number; weight: number } {
  const radius = Math.min(width, height) * 0.28;
  const repelRadius = radius * 0.35;
  let vx = 0;
  let vy = 0;
  let total = 0;

  for (const other of whales) {
    if (other.id === whale.id) continue;
    const dx = other.x - whale.x;
    const dy = other.y - whale.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1 || d > radius) continue;

    const t = 1 - d / radius;
    const nx = dx / d;
    const ny = dy / d;
    const alignX = Math.cos(other.heading);
    const alignY = Math.sin(other.heading);
    const attract = whale.socialAffinity >= 0 ? t : -t;
    const repel = d < repelRadius ? (1 - d / repelRadius) * 1.3 : 0;

    vx += nx * attract + alignX * t * 0.65 - nx * repel;
    vy += ny * attract + alignY * t * 0.65 - ny * repel;
    total += t;
  }

  if (total <= 0.0001) return { heading: whale.heading, weight: 0 };
  return {
    heading: Math.atan2(vy, vx),
    weight: clamp(total / 2.4, 0, 1),
  };
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
    speed: whale.speed,
    cruiseSpeed: whale.cruiseSpeed,
    turnRate: whale.turnRate,
    displayBank: whale.displayBank,
    faceDir: whale.faceDir,
    bellyFlip: whale.bellyFlip,
    bellyUp: whale.bellyUp,
    bellyClock: whale.bellyClock,
    bellyDuration: whale.bellyDuration,
    bellyCooldown: whale.bellyCooldown,
    phase: whale.phase,
    tailPhase: whale.tailPhase,
    tailFreq: whale.tailFreq,
    tailAmp: whale.tailAmp,
    bodyWaveAmp: whale.bodyWaveAmp,
    bodyWaveFreq: whale.bodyWaveFreq,
    thrustGain: whale.thrustGain,
    steerResponsiveness: whale.steerResponsiveness,
    inertia: whale.inertia,
    socialAffinity: whale.socialAffinity,
    calmness: whale.calmness,
    state: whale.state,
    action: whale.action,
    energy: whale.energy,
    nearbyDensity: whale.nearbyDensity,
    actionClock: whale.actionClock,
    actionDuration: whale.actionDuration,
    actionTargetId: whale.actionTargetId,
    orbitDir: whale.orbitDir,
    stateClock: whale.stateClock,
    stateInterval: whale.stateInterval,
    roamClock: whale.roamClock,
    roamInterval: whale.roamInterval,
    roamX: whale.roamX,
    roamY: whale.roamY,
  };
}

function hydrateWhales(states: PersistedWhaleState[], width: number, height: number): WhaleAgent[] {
  return states.map((s, idx) => {
    const anyState = s as any;
    const isPlayer = Boolean((s as any).isPlayer) || s.id === PLAYER_WHALE_ID;
    const x = clamp(anyState.x ?? randomRange(width * 0.18, width * 0.82), 24, width - 24);
    const y = clamp(anyState.y ?? randomRange(height * 0.2, height * 0.8), 22, height - 22);
    const heading = anyState.heading ?? randomRange(-Math.PI, Math.PI);
    const cruiseSpeed = anyState.cruiseSpeed ?? anyState.baseSpeed ?? randomRange(3.8, 7.4) * (anyState.depthScale ?? 1);
    return {
      id: isPlayer ? PLAYER_WHALE_ID : s.id,
      name: anyState.name || pickWhaleName(idx, isPlayer),
      isPlayer,
      silhouette: anyState.silhouette || pickSilhouette(idx),
      species: anyState.species || (idx % 2 === 0 ? 'humpback' : 'longfin'),
      personality: anyState.personality || pickPersonality(),
      tint: anyState.tint || 'rgba(120,188,226,1)',
      size: anyState.size ?? randomRange(104, 140),
      depthScale: anyState.depthScale ?? randomRange(0.84, 1.12),
      depthOpacity: anyState.depthOpacity ?? randomRange(0.44, 0.8),
      x,
      y,
      heading,
      speed: anyState.speed ?? cruiseSpeed,
      cruiseSpeed,
      turnRate: anyState.turnRate ?? anyState.turnVelocity ?? 0,
      displayBank: anyState.displayBank ?? 0,
      faceDir: (anyState.faceDir ?? (Math.cos(heading) >= 0 ? 1 : -1)) >= 0 ? 1 : -1,
      bellyFlip: anyState.bellyFlip ?? 1,
      bellyUp: Boolean(anyState.bellyUp),
      bellyClock: anyState.bellyClock ?? 0,
      bellyDuration: anyState.bellyDuration ?? 0,
      bellyCooldown: anyState.bellyCooldown ?? randomRange(14, 28),
      phase: anyState.phase ?? Math.random() * Math.PI * 2,
      tailPhase: anyState.tailPhase ?? Math.random() * Math.PI * 2,
      tailFreq: anyState.tailFreq ?? randomRange(0.54, 0.94),
      tailAmp: anyState.tailAmp ?? randomRange(0.34, 0.6),
      bodyWaveAmp: anyState.bodyWaveAmp ?? randomRange(2.8, 6.8),
      bodyWaveFreq: anyState.bodyWaveFreq ?? randomRange(0.28, 0.62),
      thrustGain: anyState.thrustGain ?? randomRange(0.9, 1.8),
      steerResponsiveness: anyState.steerResponsiveness ?? randomRange(0.36, 0.68),
      inertia: anyState.inertia ?? randomRange(1.8, 2.6),
      socialAffinity: anyState.socialAffinity ?? 1,
      calmness: anyState.calmness ?? 0.4,
      state: coerceState(anyState.state, initialStateForPersonality(anyState.personality || pickPersonality())),
      action: coerceAction(anyState.action, 'ignore'),
      energy: clamp(anyState.energy ?? randomRange(0.45, 0.88), 0.08, 1),
      nearbyDensity: clamp(anyState.nearbyDensity ?? 0, 0, 1),
      actionClock: anyState.actionClock ?? 0,
      actionDuration: anyState.actionDuration ?? randomRange(2, 4.4),
      actionTargetId: typeof anyState.actionTargetId === 'string' ? anyState.actionTargetId : null,
      orbitDir: anyState.orbitDir === -1 ? -1 : 1,
      stateClock: anyState.stateClock ?? 0,
      stateInterval: anyState.stateInterval ?? randomRange(2.6, 5.6),
      roamClock: anyState.roamClock ?? 0,
      roamInterval: anyState.roamInterval ?? randomRange(3.8, 7.4),
      roamX: anyState.roamX ?? randomRange(width * 0.08, width * 0.92),
      roamY: anyState.roamY ?? randomRange(height * 0.08, height * 0.92),
      xAnim: new Animated.Value(x),
      yAnim: new Animated.Value(y),
      angleAnim: new Animated.Value(anyState.displayBank ?? 0),
      faceAnim: new Animated.Value((anyState.faceDir ?? (Math.cos(heading) >= 0 ? 1 : -1)) >= 0 ? 1 : -1),
      bellyAnim: new Animated.Value(anyState.bellyFlip ?? 1),
      breathAnim: new Animated.Value(0.5 + 0.5 * Math.sin((anyState.phase ?? 0) + 0.5)),
      tailAnim: new Animated.Value(0),
      bobAnim: new Animated.Value(0),
      opacityAnim: new Animated.Value(anyState.depthOpacity ?? 0.66),
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

  // Coarse stepping: preserve world continuity without simulating every frame.
  const steps = Math.min(180, Math.max(16, Math.round(elapsed / 2.2)));
  const dt = elapsed / steps;
  let simClock = startClock;

  for (let i = 0; i < steps; i += 1) {
    simClock += dt;
    stepWhalesMotion(whales, width, height, dt, simClock, false);
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
    <Svg width="100%" height="100%" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid meet">
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
        <G transform={shape.flipY ? 'translate(0 180) scale(1 -1)' : undefined}>
          <Path d={shape.tail} fill={`url(#${tailGrad})`} />
          <Path d={shape.body} fill={`url(#${bodyGrad})`} />
          <Path d={shape.belly} fill="rgba(8,18,30,0.22)" />
          <Path d={shape.back} fill={`url(#${backGrad})`} />
          <Path d={shape.head} fill={`url(#${headGlow})`} />
          <Path d={shape.finA} fill="rgba(188,230,245,0.2)" />
          <Path d={shape.finB} fill="rgba(178,220,240,0.18)" />
          <Path d={shape.blowhole} fill="rgba(200,236,248,0.24)" />
          {shape.pleats.map((p, idx) => (
            <Path key={`${whaleId}-pleat-${idx}`} d={p} stroke="rgba(212,232,242,0.22)" strokeWidth={1.2} fill="none" />
          ))}
          <Circle cx={shape.eye.cx} cy={shape.eye.cy} r={shape.eye.r} fill="rgba(215,240,248,0.4)" />
          {isPlayer ? <Path d={shape.playerMark} fill="rgba(200,242,255,0.35)" /> : null}
        </G>
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
    finA: string;
    finB: string;
    blowhole: string;
    pleats: string[];
    flipY?: boolean;
    playerMark: string;
    eye: { cx: number; cy: number; r: number };
  }
> = {
  // 1) Raker: humpback-like side profile, fuller chest and curved rostrum.
  raker: {
    body:
      'M22 90 C44 54 98 34 170 36 C242 38 292 60 318 82 C344 104 348 118 336 124 C310 140 244 150 174 147 C110 144 64 132 36 114 C22 104 16 98 22 90 Z',
    tail:
      'M304 86 C324 66 342 42 344 20 C356 42 360 62 350 80 C357 78 368 76 376 80 C372 94 362 104 348 112 C330 124 314 124 300 120 Z M318 90 C326 84 336 84 344 90 C336 96 326 96 318 90 Z',
    belly:
      'M20 94 C38 118 78 142 132 152 C188 160 250 156 304 132 C272 148 224 162 166 160 C102 158 54 140 26 108 C18 98 16 94 20 94 Z',
    back: 'M66 56 C120 34 204 40 276 66 C224 52 148 48 84 66 Z',
    head: 'M20 92 C30 78 52 74 70 82 C54 92 42 104 40 116 C30 108 22 102 20 92 Z',
    finA: 'M142 118 C170 130 198 154 210 174 C220 184 228 184 232 172 C236 154 216 128 182 110 C166 102 152 102 142 118 Z',
    finB: 'M212 78 C224 66 238 66 246 78 C236 84 224 84 212 78 Z',
    blowhole: 'M104 72 C112 69 120 69 128 72 C120 75 112 75 104 72 Z',
    pleats: [
      'M28 98 C70 132 132 150 198 150',
      'M34 104 C78 136 140 152 206 150',
      'M42 110 C86 138 146 152 210 148',
      'M52 116 C94 140 152 152 214 146',
      'M62 122 C104 142 160 150 218 142',
    ],
    playerMark: 'M160 74 C170 70 182 70 190 76 C180 80 170 80 160 74 Z',
    eye: { cx: 86, cy: 88, r: 2.2 },
  },
  // 2) Leviathan: blue-whale-like long side profile with smoother taper.
  leviathan: {
    body:
      'M22 92 C42 58 96 38 166 38 C236 38 288 58 316 80 C338 98 342 116 332 124 C306 142 244 154 176 152 C110 150 62 136 34 116 C24 108 18 100 22 92 Z',
    tail:
      'M306 86 C324 70 342 48 348 28 C358 50 360 68 350 84 C358 82 368 82 376 86 C370 100 360 110 346 118 C332 126 318 126 306 122 Z M320 92 C328 86 338 86 346 92 C338 98 328 98 320 92 Z',
    belly:
      'M22 96 C42 120 84 144 138 154 C194 162 256 156 312 132 C278 150 228 164 168 164 C104 164 54 146 26 112 C20 102 18 98 22 96 Z',
    back: 'M64 58 C120 38 202 42 274 68 C224 54 150 50 86 68 Z',
    head: 'M22 94 C32 80 52 76 70 82 C54 92 42 104 40 116 C30 110 24 102 22 94 Z',
    finA: 'M148 120 C176 130 204 152 218 174 C226 184 234 184 238 172 C242 152 222 126 190 108 C172 100 158 102 148 120 Z',
    finB: 'M216 80 C226 70 238 70 244 80 C236 86 226 86 216 80 Z',
    blowhole: 'M110 74 C118 71 126 71 134 74 C126 77 118 77 110 74 Z',
    pleats: [
      'M30 100 C74 132 136 150 202 150',
      'M38 106 C82 136 144 152 210 150',
      'M46 112 C90 140 150 152 214 148',
      'M56 118 C98 142 156 152 218 146',
    ],
    playerMark: 'M164 76 C174 72 186 72 194 78 C184 82 174 82 164 76 Z',
    eye: { cx: 88, cy: 90, r: 2.1 },
  },
  // 3) Orca: shorter, thicker front with pronounced fluke tips.
  orca: {
    body:
      'M24 92 C44 62 94 44 160 44 C226 44 278 62 308 84 C328 98 332 112 324 120 C300 136 242 148 178 148 C116 148 68 136 38 116 C28 110 20 100 24 92 Z',
    tail:
      'M298 90 C316 74 334 52 340 30 C350 52 352 70 344 86 C352 84 360 84 368 90 C362 104 352 114 338 122 C324 130 310 130 298 126 Z M312 96 C320 90 330 90 338 96 C330 102 320 102 312 96 Z',
    belly:
      'M24 98 C44 120 84 142 136 152 C190 160 250 156 304 136 C274 152 228 164 172 164 C108 164 58 146 30 114 C24 106 22 100 24 98 Z',
    back: 'M68 62 C120 44 196 48 264 72 C216 58 146 54 88 72 Z',
    head: 'M24 94 C34 82 52 78 68 84 C54 94 44 106 42 116 C32 110 26 102 24 94 Z',
    finA: 'M150 118 C178 130 206 152 220 174 C228 184 236 184 240 172 C242 154 224 128 192 110 C174 102 160 102 150 118 Z',
    finB: 'M210 74 C224 54 238 54 246 74 C236 80 224 80 210 74 Z',
    blowhole: 'M106 76 C114 73 122 73 130 76 C122 79 114 79 106 76 Z',
    pleats: [
      'M30 102 C72 132 132 150 196 150',
      'M38 108 C80 136 140 152 204 150',
      'M46 114 C88 140 146 152 208 148',
    ],
    flipY: true,
    playerMark: 'M158 78 C168 74 180 74 188 80 C178 84 168 84 158 78 Z',
    eye: { cx: 84, cy: 90, r: 2.1 },
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
    backgroundColor: 'rgba(172,232,255,0.06)',
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
