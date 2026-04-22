"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { Feature, FeatureCollection } from "geojson";
import countries110m from "world-atlas/countries-110m.json";

type Climate = "expansion" | "contraction" | "stagflation";

const CLIMATE_COLOR: Record<Climate, string> = {
  expansion: "#e5b661",
  contraction: "#8b8ea3",
  stagflation: "#c47a52",
};

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function buildCountryLines(radius: number): THREE.BufferGeometry {
  const topo = countries110m as unknown as Topology;
  const geo = feature(
    topo,
    topo.objects.countries,
  ) as unknown as FeatureCollection;

  const positions: number[] = [];

  const addRing = (ring: number[][]) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      const p1 = latLngToVec3(a[1], a[0], radius);
      const p2 = latLngToVec3(b[1], b[0], radius);
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  };

  const visit = (feat: Feature) => {
    const geom = feat.geometry;
    if (!geom) return;
    if (geom.type === "Polygon") {
      for (const ring of geom.coordinates) addRing(ring as number[][]);
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        for (const ring of poly) addRing(ring as number[][]);
      }
    }
  };

  for (const feat of geo.features) visit(feat);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

function buildGraticule(radius: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const step = 4;
  // Latitude lines every 30°
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lng = -180; lng < 180; lng += step) {
      const p1 = latLngToVec3(lat, lng, radius);
      const p2 = latLngToVec3(lat, lng + step, radius);
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }
  // Longitude lines every 30°
  for (let lng = -180; lng < 180; lng += 30) {
    for (let lat = -80; lat < 80; lat += step) {
      const p1 = latLngToVec3(lat, lng, radius);
      const p2 = latLngToVec3(lat + step, lng, radius);
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

interface EarthProps {
  climate: Climate;
}

function Earth({ climate }: EarthProps) {
  const groupRef = useRef<THREE.Group>(null);
  const color = CLIMATE_COLOR[climate];

  const countryGeometry = useMemo(() => buildCountryLines(1.003), []);
  const graticuleGeometry = useMemo(() => buildGraticule(1.001), []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer glow */}
      <Sphere args={[1.25, 48, 48]}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Solid inner globe (oceans) */}
      <Sphere args={[1, 64, 64]}>
        <meshStandardMaterial
          color="#0f1220"
          emissive={color}
          emissiveIntensity={0.04}
          roughness={0.95}
          metalness={0.1}
        />
      </Sphere>

      {/* Graticule (lat/lng grid) */}
      <lineSegments geometry={graticuleGeometry}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.08}
        />
      </lineSegments>

      {/* Country outlines */}
      <lineSegments geometry={countryGeometry}>
        <lineBasicMaterial color={color} transparent opacity={0.85} />
      </lineSegments>
    </group>
  );
}

function FloatingParticles({ color }: { color: string }) {
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) {
      const r = 1.8 + Math.random() * 1.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y -= delta * 0.025;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.018} color={color} transparent opacity={0.45} />
    </points>
  );
}

interface ZoomGlobeProps {
  climate: Climate;
}

export default function ZoomGlobe({ climate }: ZoomGlobeProps) {
  const color = CLIMATE_COLOR[climate];
  return (
    <Canvas camera={{ position: [0, 0, 3.2], fov: 50 }} dpr={[1, 2]}>
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color={color} />
      <pointLight position={[-5, -3, -2]} intensity={0.35} color="#4a5070" />
      <Earth climate={climate} />
      <FloatingParticles color={color} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate={false}
        enableDamping
      />
    </Canvas>
  );
}
