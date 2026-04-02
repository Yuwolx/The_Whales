import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';

type WhaleVisual = {
  id: string;
  tint: string;
  size: number;
  depth: 'foreground' | 'mid' | 'background';
  depthScale: number;
  depthOpacity: number;
  glowStrength: number;
};

type WhaleRuntime = {
  x: Animated.Value;
  y: Animated.Value;
  angle: Animated.Value;
  breath: Animated.Value;
  tailWag: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  pauseBias: number;
  hueBias: number;
};

type WhaleMotion = {
  vx: number;
  vy: number;
};

type MusicEvent = {
  id: number;
  x: number;
  y: number;
  rare: boolean;
};

type Connection = {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  closeness: number;
};

const WHALES: WhaleVisual[] = [
  { id: 'w-1', tint: 'rgba(126, 196, 236, 0.34)', size: 122, depth: 'foreground', depthScale: 1.1, depthOpacity: 0.78, glowStrength: 1.05 },
  { id: 'w-2', tint: 'rgba(105, 178, 230, 0.31)', size: 126, depth: 'foreground', depthScale: 1.05, depthOpacity: 0.74, glowStrength: 0.98 },
  { id: 'w-3', tint: 'rgba(121, 190, 230, 0.30)', size: 116, depth: 'mid', depthScale: 0.98, depthOpacity: 0.64, glowStrength: 0.84 },
  { id: 'w-4', tint: 'rgba(92, 165, 216, 0.32)', size: 118, depth: 'mid', depthScale: 0.94, depthOpacity: 0.6, glowStrength: 0.78 },
  { id: 'w-5', tint: 'rgba(111, 182, 224, 0.29)', size: 108, depth: 'background', depthScale: 0.82, depthOpacity: 0.42, glowStrength: 0.55 },
];

const PARTICLE_COUNT = 34;

export default function App() {
  const { width, height } = useWindowDimensions();
  const worldWidth = Math.max(width * 1.8, width + 260);
  const worldHeight = Math.max(height * 1.8, height + 360);
  const worldOffsetX = (worldWidth - width) * 0.5;
  const worldOffsetY = (worldHeight - height) * 0.5;
  const cameraLimitX = worldOffsetX;
  const cameraLimitY = worldOffsetY;

  const [focusedWhaleId, setFocusedWhaleId] = useState<string | null>(null);
  const [oceanDepth, setOceanDepth] = useState<'normal' | 'deep'>('normal');
  const [rareEncounterText, setRareEncounterText] = useState<string | null>(null);
  const [musicEvents, setMusicEvents] = useState<MusicEvent[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showHint, setShowHint] = useState(true);

  const nextMusicEventId = useRef(1);
  const whalePositions = useRef<Record<string, { x: number; y: number }>>({});
  const whaleMotion = useRef<Record<string, WhaleMotion>>({});
  const whaleAngles = useRef<Record<string, number>>({});
  const socialCenter = useRef<{ x: number; y: number }>({ x: worldWidth * 0.5, y: worldHeight * 0.5 });
  const activeEncounters = useRef<Set<string>>(new Set());
  const hasInteracted = useRef(false);

  const cameraX = useRef(new Animated.Value(0)).current;
  const cameraY = useRef(new Animated.Value(0)).current;
  const uiFade = useRef(new Animated.Value(1)).current;
  const ambientBoost = useRef(new Animated.Value(0)).current;
  const planktonReact = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(0.85)).current;
  const musicIndicatorPulse = useRef(new Animated.Value(0)).current;
  const musicPulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const whaleRuntimes = useMemo<Record<string, WhaleRuntime>>(() => {
    const runtimes: Record<string, WhaleRuntime> = {};
    for (const whale of WHALES) {
      const sx = worldWidth ? randomRange(worldWidth * 0.24, worldWidth * 0.76) : randomRange(140, 460);
      const sy = worldHeight ? randomRange(worldHeight * 0.24, worldHeight * 0.76) : randomRange(220, 760);
      const baseAngle = randomRange(-0.45, 0.45);

      runtimes[whale.id] = {
        x: new Animated.Value(sx),
        y: new Animated.Value(sy),
        angle: new Animated.Value(baseAngle),
        breath: new Animated.Value(Math.random()),
        tailWag: new Animated.Value(randomRange(-0.4, 0.4)),
        scale: new Animated.Value(0.99 + Math.random() * 0.03),
        opacity: new Animated.Value(whale.depthOpacity + randomRange(-0.04, 0.05)),
        pauseBias: 0.15 + Math.random() * 0.14,
        hueBias: Math.random() * 0.08,
      };

      whalePositions.current[whale.id] = { x: sx, y: sy };
      whaleAngles.current[whale.id] = baseAngle;

      const theta = randomRange(0, Math.PI * 2);
      whaleMotion.current[whale.id] = {
        vx: Math.cos(theta) * randomRange(0.25, 0.55),
        vy: Math.sin(theta) * randomRange(0.2, 0.5),
      };
    }
    return runtimes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }).map((_, idx) => {
      const size = 1.5 + Math.random() * 2.8;
      const drift = new Animated.Value(0);
      const twinkle = new Animated.Value(0.22 + Math.random() * 0.42);
      const x = Math.random() * Math.max(worldWidth, 520);
      const y = Math.random() * Math.max(worldHeight, 900);
      return { id: `p-${idx}`, size, drift, twinkle, x, y };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(hintOpacity, {
      toValue: 0.9,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setShowHint(false));
    }, 3000);

    return () => clearTimeout(timer);
  }, [hintOpacity]);

  useEffect(() => {
    for (const p of particles) {
      const travelMs = 14000 + Math.random() * 14000;

      Animated.loop(
        Animated.sequence([
          Animated.timing(p.drift, {
            toValue: 1,
            duration: travelMs,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(p.drift, {
            toValue: 0,
            duration: travelMs,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(p.twinkle, {
            toValue: 0.92,
            duration: 2800 + Math.random() * 2500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(p.twinkle, {
            toValue: 0.25,
            duration: 2600 + Math.random() * 2800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    Animated.timing(uiFade, {
      toValue: focusedWhaleId ? 0.66 : 1,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focusedWhaleId, particles, uiFade]);

  useEffect(() => {
    const centerShift = setInterval(() => {
      socialCenter.current = {
        x: clamp(worldWidth * 0.5 + randomRange(-worldWidth * 0.12, worldWidth * 0.12), worldWidth * 0.22, worldWidth * 0.78),
        y: clamp(worldHeight * 0.5 + randomRange(-worldHeight * 0.12, worldHeight * 0.12), worldHeight * 0.22, worldHeight * 0.78),
      };
    }, 9000);
    return () => clearInterval(centerShift);
  }, [worldHeight, worldWidth]);

  useEffect(() => {
    if (!width || !height) return;

    const listenerIds: Array<{ id: string; lx: string; ly: string; la: string }> = [];

    for (const whale of WHALES) {
      const rt = whaleRuntimes[whale.id];

      // Movement model: gentle drift + nearby-attraction, with in/out easing so speed breathes naturally.
      const loopDrift = () => {
        const current = whalePositions.current[whale.id] ?? { x: worldWidth * 0.5, y: worldHeight * 0.5 };
        const motion = whaleMotion.current[whale.id] ?? { vx: 0.4, vy: 0.25 };

        const neighbors = WHALES.filter((w) => w.id !== whale.id)
          .map((w) => ({ id: w.id, p: whalePositions.current[w.id] }))
          .filter((n) => Boolean(n.p)) as Array<{ id: string; p: { x: number; y: number } }>;

        let attractX = 0;
        let attractY = 0;
        let attractWeight = 0;

        for (const n of neighbors) {
          const d = distance(current.x, current.y, n.p.x, n.p.y);
          const influenceRadius = Math.min(worldWidth, worldHeight) * 0.42;
          if (d < influenceRadius && d > 1) {
            const strength = 1 - d / influenceRadius;
            attractX += ((n.p.x - current.x) / d) * strength;
            attractY += ((n.p.y - current.y) / d) * strength;
            attractWeight += strength;
          }
        }

        const centerPullX = (worldWidth * 0.5 - current.x) / worldWidth;
        const centerPullY = (worldHeight * 0.5 - current.y) / worldHeight;
        const socialPullX = (socialCenter.current.x - current.x) / worldWidth;
        const socialPullY = (socialCenter.current.y - current.y) / worldHeight;

        const jitterX = randomRange(-0.28, 0.28);
        const jitterY = randomRange(-0.24, 0.24);

        const vx =
          motion.vx * 0.72 +
          centerPullX * 0.22 +
          socialPullX * 0.46 +
          (attractWeight > 0 ? (attractX / attractWeight) * 0.74 : 0) +
          jitterX * 0.05;
        const vy =
          motion.vy * 0.72 +
          centerPullY * 0.22 +
          socialPullY * 0.44 +
          (attractWeight > 0 ? (attractY / attractWeight) * 0.72 : 0) +
          jitterY * 0.05;

        whaleMotion.current[whale.id] = { vx, vy };

        const travel = randomRange(58, 112);
        const targetX = clamp(current.x + vx * travel, whale.size * 0.8, worldWidth - whale.size * 0.8);
        const targetY = clamp(current.y + vy * travel, whale.size * 0.8, worldHeight - whale.size * 0.8);

        const dx = targetX - current.x;
        const dy = targetY - current.y;
        const heading = Math.atan2(dy, dx);
        const directionLength = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
        const nx = dx / directionLength;
        const ny = dy / directionLength;
        const px = -ny;
        const py = nx;
        const curveAmount = randomRange(-1, 1) * travel * randomRange(0.2, 0.34);
        const midX = clamp((current.x + targetX) * 0.5 + px * curveAmount, whale.size * 0.8, worldWidth - whale.size * 0.8);
        const midY = clamp((current.y + targetY) * 0.5 + py * curveAmount, whale.size * 0.8, worldHeight - whale.size * 0.8);
        const headingMidRaw = Math.atan2(midY - current.y, midX - current.x);
        const headingFinalRaw = Math.atan2(targetY - midY, targetX - midX);
        const currentAngle = whaleAngles.current[whale.id] ?? heading;
        const headingMid = unwrapAngle(currentAngle, headingMidRaw);
        const headingFinal = unwrapAngle(headingMid, headingFinalRaw);

        const driftDuration = 7000 + Math.random() * 7000;
        const pauseDuration = Math.random() < rt.pauseBias ? 900 + Math.random() * 1800 : 120 + Math.random() * 420;

        Animated.parallel([
          Animated.sequence([
            Animated.timing(rt.x, {
              toValue: midX,
              duration: driftDuration * 0.52,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(rt.x, {
              toValue: targetX,
              duration: driftDuration * 0.48,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(rt.y, {
              toValue: midY,
              duration: driftDuration * 0.52,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(rt.y, {
              toValue: targetY,
              duration: driftDuration * 0.48,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(rt.angle, {
              toValue: headingMid,
              duration: driftDuration * 0.52,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(rt.angle, {
              toValue: headingFinal,
              duration: driftDuration * 0.48,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(rt.scale, {
              toValue: 1.0 + Math.random() * 0.018,
              duration: driftDuration * 0.52,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(rt.scale, {
              toValue: 0.99 + Math.random() * 0.014,
              duration: driftDuration * 0.48,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]).start(() => {
          setTimeout(loopDrift, pauseDuration);
        });
      };

      // Only the back of the body oscillates to suggest tail propulsion.
      Animated.loop(
        Animated.sequence([
          Animated.timing(rt.tailWag, {
            toValue: 1,
            duration: 3200 + Math.random() * 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(rt.tailWag, {
            toValue: -1,
            duration: 3200 + Math.random() * 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Slow breathing pulse across scale/opacity.
      Animated.loop(
        Animated.sequence([
          Animated.timing(rt.breath, {
            toValue: 1,
            duration: 6200 + Math.random() * 2400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(rt.breath, {
            toValue: 0,
            duration: 6000 + Math.random() * 2600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(rt.opacity, {
            toValue: whale.depthOpacity - 0.03 + Math.random() * 0.03,
            duration: 6000 + Math.random() * 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(rt.opacity, {
            toValue: whale.depthOpacity + 0.03 + Math.random() * 0.04,
            duration: 6200 + Math.random() * 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();

      const lx = rt.x.addListener(({ value }) => {
        whalePositions.current[whale.id] = {
          ...(whalePositions.current[whale.id] ?? { x: value, y: worldHeight * 0.5 }),
          x: value,
        };
      });
      const ly = rt.y.addListener(({ value }) => {
        whalePositions.current[whale.id] = {
          ...(whalePositions.current[whale.id] ?? { x: worldWidth * 0.5, y: value }),
          y: value,
        };
      });
      const la = rt.angle.addListener(({ value }) => {
        whaleAngles.current[whale.id] = value;
      });

      listenerIds.push({ id: whale.id, lx, ly, la });
      loopDrift();
    }

    return () => {
      for (const item of listenerIds) {
        whaleRuntimes[item.id].x.removeListener(item.lx);
        whaleRuntimes[item.id].y.removeListener(item.ly);
        whaleRuntimes[item.id].angle.removeListener(item.la);
      }
    };
  }, [height, whaleRuntimes, width]);

  useEffect(() => {
    const encounterInterval = setInterval(() => {
      const positions = whalePositions.current;
      const ids = WHALES.map((w) => w.id);
      const activeConnections: Connection[] = [];

      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const idA = ids[i];
          const idB = ids[j];
          const a = positions[idA];
          const b = positions[idB];
          if (!a || !b) continue;

          const d = distance(a.x, a.y, b.x, b.y);
          const threshold = Math.min(width, height) * 0.33;
          const key = `${idA}::${idB}`;

          if (d < threshold) {
            const closeness = 1 - d / threshold;
            activeConnections.push({
              id: key,
              from: idA,
              to: idB,
              x1: a.x,
              y1: a.y,
              x2: b.x,
              y2: b.y,
              closeness,
            });

            if (!activeEncounters.current.has(key)) {
              activeEncounters.current.add(key);
              triggerMusicEvent((a.x + b.x) / 2, (a.y + b.y) / 2, d < threshold * 0.56);
            }
          } else if (d > threshold * 1.34) {
            activeEncounters.current.delete(key);
          }
        }
      }

      setConnections(activeConnections);
    }, 800);

    return () => clearInterval(encounterInterval);
  }, [height, width]);

  useEffect(() => {
    if (connections.length > 0 || musicEvents.length > 0) {
      musicPulseLoop.current?.stop();
      musicPulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(musicIndicatorPulse, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(musicIndicatorPulse, {
            toValue: 0,
            duration: 1300,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      musicPulseLoop.current.start();
    } else {
      musicPulseLoop.current?.stop();
      musicPulseLoop.current = null;
      Animated.timing(musicIndicatorPulse, {
        toValue: 0,
        duration: 480,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      musicPulseLoop.current?.stop();
      musicPulseLoop.current = null;
    };
  }, [connections.length, musicEvents.length, musicIndicatorPulse]);

  const markInteracted = () => {
    if (hasInteracted.current) return;
    hasInteracted.current = true;

    Animated.timing(hintOpacity, {
      toValue: 0,
      duration: 450,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setShowHint(false));
  };

  const triggerMusicEvent = (x: number, y: number, rare: boolean) => {
    const id = nextMusicEventId.current++;

    setMusicEvents((prev) => [...prev, { id, x, y, rare }]);

    Animated.sequence([
      Animated.timing(ambientBoost, {
        toValue: 1,
        duration: 850,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ambientBoost, {
        toValue: 0,
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.timing(planktonReact, {
        toValue: 1,
        duration: 540,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(planktonReact, {
        toValue: 0,
        duration: 1650,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    if (rare) {
      setRareEncounterText('Rare encounter');
      setTimeout(() => setRareEncounterText(null), 2400);
    }

    setTimeout(() => {
      setMusicEvents((prev) => prev.filter((e) => e.id !== id));
    }, 2300);
  };

  const focusWhale = (whaleId: string) => {
    markInteracted();

    const p = whalePositions.current[whaleId];
    if (!p) return;

    setFocusedWhaleId((prev) => (prev === whaleId ? null : whaleId));

    if (focusedWhaleId === whaleId) {
      Animated.parallel([
        Animated.timing(cameraX, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cameraY, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    const tx = clamp(width * 0.5 - p.x + worldOffsetX, -cameraLimitX, cameraLimitX);
    const ty = clamp(height * 0.5 - p.y + worldOffsetY, -cameraLimitY, cameraLimitY);

    Animated.parallel([
      Animated.timing(cameraX, {
        toValue: tx,
        duration: 1600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cameraY, {
        toValue: ty,
        duration: 1600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleEnvironmentLongPress = () => {
    markInteracted();
    setOceanDepth('deep');
    setTimeout(() => setOceanDepth('normal'), 1700);
  };

  const saveMoment = () => {
    markInteracted();
    Animated.sequence([
      Animated.timing(uiFade, {
        toValue: 0.82,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(uiFade, {
        toValue: focusedWhaleId ? 0.66 : 1,
        duration: 520,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const statusText = `${connections.length} whale${connections.length === 1 ? '' : 's'} connected`;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.View
        style={[
          styles.worldLayer,
          {
            width: worldWidth,
            height: worldHeight,
            left: -worldOffsetX,
            top: -worldOffsetY,
            transform: [{ translateX: cameraX }, { translateY: cameraY }],
          },
        ]}
      >
        <LinearGradient
          colors={
            oceanDepth === 'deep'
              ? ['#04090F', '#07111A', '#081522', '#0A1A2A']
              : ['#07121D', '#0A1B2B', '#0B1C2C', '#05080F']
          }
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.88, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.depthVeil,
            {
              opacity: ambientBoost.interpolate({
                inputRange: [0, 1],
                outputRange: [0.2, 0.36],
              }),
            },
          ]}
        />

        <View pointerEvents="none" style={styles.lightRayLayer}>
          <View style={[styles.ray, styles.ray1]} />
          <View style={[styles.ray, styles.ray2]} />
          <View style={[styles.ray, styles.ray3]} />
        </View>

        <Pressable style={StyleSheet.absoluteFill} delayLongPress={450} onLongPress={handleEnvironmentLongPress} />

        {particles.map((p) => {
          const yDrift = p.drift.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });
          const xDrift = p.drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

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
                  opacity: Animated.multiply(
                    p.twinkle,
                    planktonReact.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.42],
                    })
                  ),
                  transform: [{ translateY: yDrift }, { translateX: xDrift }],
                },
              ]}
            />
          );
        })}

        {connections.map((c) => (
          <ConnectionBridge key={c.id} connection={c} />
        ))}

        {WHALES.map((whale) => {
          const rt = whaleRuntimes[whale.id];
          const whaleWidth = whale.size * whale.depthScale;
          const whaleHeight = whale.size * 0.36 * whale.depthScale;
          const rotate = rt.angle.interpolate({
            inputRange: [-12.566, 12.566],
            outputRange: ['-12.566rad', '12.566rad'],
          });
          const tailWag = rt.tailWag.interpolate({
            inputRange: [-1, 1],
            outputRange: ['-0.06rad', '0.06rad'],
          });
          const breathScale = rt.breath.interpolate({
            inputRange: [0, 1],
            outputRange: [0.98, 1.02],
          });

          return (
            <Animated.View
              key={whale.id}
              style={[
                styles.whaleWrap,
                {
                  width: whaleWidth,
                  height: whaleHeight,
                  marginLeft: -whaleWidth / 2,
                  marginTop: -whaleHeight / 2,
                  opacity: rt.opacity,
                  transform: [{ translateX: rt.x }, { translateY: rt.y }, { rotate }, { scale: rt.scale }, { scale: breathScale }],
                },
              ]}
            >
              <Pressable style={StyleSheet.absoluteFill} onPress={() => focusWhale(whale.id)}>
                <WhaleGlyph whale={whale} hueBias={rt.hueBias} tailWag={tailWag} />
              </Pressable>
            </Animated.View>
          );
        })}

        {musicEvents.map((event) => (
          <MusicPulse key={event.id} x={event.x} y={event.y} rare={event.rare} />
        ))}
      </Animated.View>

      {showHint ? (
        <Animated.View pointerEvents="none" style={[styles.hintWrap, { opacity: hintOpacity }]}> 
          <Text style={styles.hintText}>Tap a whale to follow</Text>
        </Animated.View>
      ) : null}

      <Animated.View pointerEvents="none" style={[styles.titleWrap, { opacity: uiFade }]}> 
        <Text style={styles.title}>The Whales</Text>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.rareWrap, { opacity: uiFade }]}> 
        {rareEncounterText ? <Text style={styles.rareText}>{rareEncounterText}</Text> : null}
      </Animated.View>

      <Animated.View style={[styles.bottomActions, { opacity: uiFade }]}>
        <View style={styles.statusWrap}>
          <Animated.View
            style={[
              styles.musicDot,
              {
                opacity: musicIndicatorPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.2, 0.78],
                }),
                transform: [
                  {
                    scale: musicIndicatorPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1.24],
                    }),
                  },
                ],
              },
            ]}
          />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        <Pressable onPress={saveMoment} style={styles.saveHitbox}>
          <BlurView intensity={34} tint="dark" style={styles.saveButton}>
            <LinearGradient
              colors={['rgba(140,204,236,0.13)', 'rgba(104,160,196,0.05)', 'rgba(49,82,106,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveGlass}
            />
            <Text style={styles.saveText}>Save</Text>
          </BlurView>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function WhaleGlyph({
  whale,
  hueBias,
  tailWag,
}: {
  whale: WhaleVisual;
  hueBias: number;
  tailWag: Animated.AnimatedInterpolation<string | number>;
}) {
  return (
    <View style={styles.whaleGlyphRoot}>
      <View
        style={[
          styles.whaleAura,
          {
            opacity: (0.22 + hueBias) * whale.glowStrength,
          },
        ]}
      />

      <Animated.View style={[styles.whaleTailWrap, { transform: [{ rotate: tailWag }] }]}>
        <View style={styles.tailJoint} />
        <View style={styles.tailFlukeTopSoft} />
        <View style={styles.tailFlukeBottomSoft} />
      </Animated.View>

      <View style={styles.whaleBodySilhouette}>
        <LinearGradient
          colors={['rgba(92,154,192,0.16)', whale.tint, `rgba(206,244,255,${0.22 + hueBias})`]}
          locations={[0, 0.56, 1]}
          start={{ x: 0, y: 0.52 }}
          end={{ x: 1, y: 0.48 }}
          style={styles.whaleBodyFill}
        />
        <LinearGradient
          colors={['rgba(208,244,255,0.28)', 'rgba(170,224,245,0)']}
          start={{ x: 0.08, y: 0.1 }}
          end={{ x: 0.9, y: 0.35 }}
          style={styles.whaleBodyTopLight}
        />
        <LinearGradient
          colors={['rgba(8,16,28,0)', 'rgba(7,14,24,0.28)']}
          start={{ x: 0.2, y: 0.45 }}
          end={{ x: 0.86, y: 1 }}
          style={styles.whaleBodyBellyShade}
        />
        <View style={styles.whaleSnout} />
        <View style={styles.whaleEyeDot} />
      </View>
    </View>
  );
}

function ConnectionBridge({ connection }: { connection: Connection }) {
  const dx = connection.x2 - connection.x1;
  const dy = connection.y2 - connection.y1;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const angle = Math.atan2(dy, dx);
  const mx = (connection.x1 + connection.x2) * 0.5;
  const my = (connection.y1 + connection.y2) * 0.5;

  return (
    <View pointerEvents="none" style={[styles.bridgeWrap, { left: mx, top: my }]}> 
      <View
        style={[
          styles.bridgeGlow,
          {
            width: length,
            marginLeft: -length * 0.5,
            opacity: 0.05 + connection.closeness * 0.14,
            transform: [{ rotate: `${angle}rad` }],
          },
        ]}
      />
      <View
        style={[
          styles.bridgeLine,
          {
            width: length,
            marginLeft: -length * 0.5,
            opacity: 0.12 + connection.closeness * 0.3,
            transform: [{ rotate: `${angle}rad` }],
          },
        ]}
      />
    </View>
  );
}

function MusicPulse({ x, y, rare }: { x: number; y: number; rare: boolean }) {
  const ripple = useRef(new Animated.Value(0)).current;
  const strand = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(ripple, {
        toValue: 1,
        duration: rare ? 2200 : 1800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(strand, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(strand, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [rare, ripple, strand]);

  return (
    <View pointerEvents="none" style={[styles.eventLayer, { left: x, top: y }]}> 
      <Animated.View
        style={[
          styles.ripple,
          {
            borderColor: rare ? 'rgba(145,220,248,0.36)' : 'rgba(120,200,235,0.28)',
            opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
            transform: [
              {
                scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.3, rare ? 2.8 : 2.25] }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.strand,
          {
            opacity: strand.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }),
            transform: [{ scaleX: strand.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) }],
          },
        ]}
      />
    </View>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function unwrapAngle(current: number, target: number) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050913',
    overflow: 'hidden',
  },
  worldLayer: {
    position: 'absolute',
  },
  depthVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#02070D',
  },
  lightRayLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  ray: {
    position: 'absolute',
    width: 210,
    height: '130%',
    backgroundColor: 'rgba(120,170,210,0.08)',
    borderRadius: 260,
    transform: [{ rotate: '-14deg' }],
  },
  ray1: {
    left: '8%',
    top: '-14%',
  },
  ray2: {
    left: '43%',
    top: '-18%',
    opacity: 0.85,
  },
  ray3: {
    left: '72%',
    top: '-12%',
    opacity: 0.7,
  },
  particle: {
    position: 'absolute',
    borderRadius: 20,
    backgroundColor: 'rgba(164,225,252,0.7)',
  },
  bridgeWrap: {
    position: 'absolute',
    width: 1,
    height: 1,
  },
  bridgeGlow: {
    position: 'absolute',
    height: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(151,224,252,0.35)',
  },
  bridgeLine: {
    position: 'absolute',
    height: 1,
    borderRadius: 99,
    backgroundColor: 'rgba(170,231,255,0.72)',
  },
  whaleWrap: {
    position: 'absolute',
  },
  whaleGlyphRoot: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  whaleAura: {
    position: 'absolute',
    width: '126%',
    height: '160%',
    left: '-12%',
    top: '-26%',
    borderRadius: 999,
    backgroundColor: 'rgba(136,205,235,0.22)',
    shadowColor: '#86D0EE',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 18,
    elevation: 4,
  },
  whaleTailWrap: {
    position: 'absolute',
    width: '23%',
    height: '42%',
    left: '2%',
    top: '34%',
  },
  tailJoint: {
    position: 'absolute',
    width: '42%',
    height: '44%',
    right: '0%',
    top: '28%',
    borderRadius: 999,
    backgroundColor: 'rgba(136,202,232,0.12)',
  },
  tailFlukeTopSoft: {
    position: 'absolute',
    width: '30%',
    height: '34%',
    left: '-2%',
    top: '18%',
    borderRadius: 999,
    backgroundColor: 'rgba(144,209,236,0.14)',
    transform: [{ rotate: '-16deg' }],
  },
  tailFlukeBottomSoft: {
    position: 'absolute',
    width: '30%',
    height: '34%',
    left: '-2%',
    top: '48%',
    borderRadius: 999,
    backgroundColor: 'rgba(128,193,225,0.12)',
    transform: [{ rotate: '16deg' }],
  },
  whaleBodySilhouette: {
    position: 'absolute',
    width: '84%',
    height: '74%',
    right: '2%',
    top: '13%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 96,
    borderBottomRightRadius: 72,
    overflow: 'hidden',
  },
  whaleBodyFill: {
    ...StyleSheet.absoluteFillObject,
  },
  whaleBodyTopLight: {
    position: 'absolute',
    width: '82%',
    height: '34%',
    right: '8%',
    top: '8%',
    borderRadius: 999,
  },
  whaleBodyBellyShade: {
    position: 'absolute',
    width: '88%',
    height: '36%',
    right: '6%',
    bottom: '0%',
    borderBottomLeftRadius: 72,
    borderBottomRightRadius: 56,
    borderTopLeftRadius: 72,
    borderTopRightRadius: 60,
  },
  whaleSnout: {
    position: 'absolute',
    width: '12%',
    height: '26%',
    right: '0%',
    top: '34%',
    borderRadius: 999,
    backgroundColor: 'rgba(216,246,255,0.26)',
  },
  whaleEyeDot: {
    position: 'absolute',
    width: 2.2,
    height: 2.2,
    right: '27%',
    top: '38%',
    borderRadius: 9,
    backgroundColor: 'rgba(214,236,246,0.26)',
  },
  whaleSwayLayer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  whaleGlow: {
    position: 'absolute',
    width: '122%',
    height: '146%',
    left: '-11%',
    top: '-23%',
    borderRadius: 999,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 22,
    elevation: 5,
  },
  whaleBody: {
    position: 'absolute',
    width: '94%',
    height: '66%',
    left: '3%',
    top: '10%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 78,
    borderBottomRightRadius: 64,
  },
  whaleBackArch: {
    position: 'absolute',
    width: '92%',
    height: '54%',
    right: '4%',
    top: '8%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 96,
  },
  whaleUnderside: {
    position: 'absolute',
    width: '86%',
    height: '24%',
    right: '8%',
    top: '54%',
    borderTopLeftRadius: 72,
    borderTopRightRadius: 56,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 24,
  },
  whaleTopHighlight: {
    position: 'absolute',
    width: '80%',
    height: '24%',
    right: '11%',
    top: '16%',
    borderRadius: 999,
  },
  whaleBellyShade: {
    position: 'absolute',
    width: '82%',
    height: '30%',
    right: '9%',
    top: '56%',
    borderBottomLeftRadius: 56,
    borderBottomRightRadius: 44,
    borderTopLeftRadius: 72,
    borderTopRightRadius: 62,
  },
  whaleTailFade: {
    position: 'absolute',
    width: '46%',
    height: '56%',
    left: '-2%',
    top: '22%',
    borderRadius: 999,
  },
  tailGroup: {
    position: 'absolute',
    width: '48%',
    height: '70%',
    left: '-1%',
    top: '15%',
  },
  tailPeduncle: {
    position: 'absolute',
    width: '34%',
    height: '30%',
    right: '-2%',
    top: '35%',
    borderRadius: 999,
    backgroundColor: 'rgba(118,186,222,0.11)',
  },
  whaleSpine: {
    position: 'absolute',
    width: '76%',
    height: '20%',
    right: '10%',
    top: '40%',
    borderRadius: 999,
  },
  whaleHeadGlow: {
    position: 'absolute',
    width: '41%',
    height: '70%',
    right: '2%',
    top: '14%',
    borderRadius: 999,
  },
  tailFlukeTop: {
    position: 'absolute',
    width: '24%',
    height: '21%',
    left: '-4%',
    top: '28%',
    borderRadius: 999,
    backgroundColor: 'rgba(134,199,231,0.14)',
    transform: [{ rotate: '-14deg' }],
  },
  tailFlukeBottom: {
    position: 'absolute',
    width: '24%',
    height: '21%',
    left: '-4%',
    top: '51%',
    borderRadius: 999,
    backgroundColor: 'rgba(126,193,227,0.13)',
    transform: [{ rotate: '14deg' }],
  },
  headNose: {
    position: 'absolute',
    width: '11%',
    height: '22%',
    right: '3%',
    top: '36%',
    borderRadius: 999,
    backgroundColor: 'rgba(214,245,255,0.28)',
  },
  headEdge: {
    position: 'absolute',
    width: '12%',
    height: '27%',
    right: '0.5%',
    top: '33%',
    borderRadius: 999,
    backgroundColor: 'rgba(221,247,255,0.16)',
  },
  whaleEye: {
    position: 'absolute',
    width: 2.5,
    height: 2.5,
    borderRadius: 8,
    right: '31%',
    top: '42%',
    backgroundColor: 'rgba(214,236,246,0.28)',
  },
  eventLayer: {
    position: 'absolute',
    marginLeft: -36,
    marginTop: -36,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 999,
    borderWidth: 1,
  },
  strand: {
    position: 'absolute',
    width: 98,
    height: 2,
    borderRadius: 99,
    backgroundColor: 'rgba(153,228,252,0.52)',
  },
  hintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '47%',
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(202,228,243,0.62)',
    fontSize: 14,
    letterSpacing: 0.7,
    fontWeight: '300',
  },
  titleWrap: {
    position: 'absolute',
    top: 62,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    color: 'rgba(208,233,248,0.72)',
    letterSpacing: 1.4,
    fontWeight: '300',
  },
  rareWrap: {
    position: 'absolute',
    top: 94,
    right: 22,
  },
  rareText: {
    color: 'rgba(164,226,248,0.74)',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  musicDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(158,229,255,0.95)',
    shadowColor: '#95E2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 7,
  },
  statusText: {
    color: 'rgba(194,226,242,0.62)',
    fontSize: 12,
    letterSpacing: 0.45,
    fontWeight: '400',
  },
  saveHitbox: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  saveButton: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(157,211,235,0.24)',
    backgroundColor: 'rgba(30,55,76,0.2)',
  },
  saveGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  saveText: {
    fontSize: 15,
    letterSpacing: 0.7,
    color: 'rgba(221,241,250,0.9)',
    fontWeight: '500',
  },
});
