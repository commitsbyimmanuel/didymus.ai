import { useCallback, useEffect, useRef } from "react";
import { CHURCHES } from "../data/churches";

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function pointInPolygon(lng, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > lat !== yj > lat
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function preparePolygons(geojson) {
  return geojson.features.map((feature) => {
    const rings = feature.geometry.coordinates;
    const outer = rings[0];
    const lngs = outer.map(([lng]) => lng);
    const lats = outer.map(([, lat]) => lat);
    return {
      rings,
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    };
  });
}

function containsLand(lng, lat, polygons) {
  return polygons.some((polygon) => {
    if (
      lng < polygon.minLng
      || lng > polygon.maxLng
      || lat < polygon.minLat
      || lat > polygon.maxLat
      || !pointInPolygon(lng, lat, polygon.rings[0])
    ) return false;
    return !polygon.rings.slice(1).some((hole) => pointInPolygon(lng, lat, hole));
  });
}

function makeLandPoints(geojson) {
  const polygons = preparePolygons(geojson);
  const points = [];
  for (let lat = -85; lat <= 85; lat += 1.45) {
    const row = Math.round((lat + 85) / 1.45);
    const spacing = 1.45 / Math.max(Math.cos(toRadians(lat)), 0.23);
    for (let lng = -178 + (row % 2) * spacing * 0.5; lng < 178; lng += spacing) {
      if (containsLand(lng, lat, polygons)) {
        const latR = toRadians(lat);
        const lngR = toRadians(lng);
        points.push({
          x: Math.cos(latR) * Math.sin(lngR),
          y: Math.sin(latR),
          z: Math.cos(latR) * Math.cos(lngR),
        });
      }
    }
  }
  return points;
}

function project(point, yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const x = point.x * cosYaw - point.z * sinYaw;
  const z = point.x * sinYaw + point.z * cosYaw;
  return {
    x,
    y: point.y * cosPitch - z * sinPitch,
    z: point.y * sinPitch + z * cosPitch,
  };
}

function churchPoint(church) {
  const lat = toRadians(church.lat);
  const lng = toRadians(church.lng);
  return {
    x: Math.cos(lat) * Math.sin(lng),
    y: Math.sin(lat),
    z: Math.cos(lat) * Math.cos(lng),
  };
}

function shortestTarget(current, target) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta;
}

export default function ChurchGlobe({ activeIndex, onActiveChange }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const pinRefs = useRef([]);
  const labelRefs = useRef([]);
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const activeRef = useRef(activeIndex);
  const rotationRef = useRef({
    yaw: toRadians(55),
    pitch: toRadians(24),
    zoom: 1,
    velocityX: 0,
    velocityY: 0,
    targetYaw: null,
    targetPitch: null,
    lastInteraction: performance.now(),
  });

  useEffect(() => {
    activeRef.current = activeIndex;
    const rotation = rotationRef.current;
    rotation.targetYaw = shortestTarget(rotation.yaw, toRadians(CHURCHES[activeIndex].lng));
    rotation.targetPitch = toRadians(CHURCHES[activeIndex].lat);
    rotation.lastInteraction = performance.now();
  }, [activeIndex]);

  const chooseChurch = useCallback((index) => {
    onActiveChange(index);
  }, [onActiveChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    const context = canvas.getContext("2d");
    const churchPoints = CHURCHES.map(churchPoint);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const abortController = new AbortController();
    let landPoints = [];
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    fetch("/ne_110m_land.geojson", { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Map data request failed with ${response.status}`);
        return response.json();
      })
      .then((geojson) => {
        landPoints = makeLandPoints(geojson);
      })
      .catch((error) => {
        if (error.name !== "AbortError") console.error("Unable to load map data", error);
      });

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const render = (time) => {
      const rotation = rotationRef.current;
      if (rotation.targetYaw !== null) {
        const yawDistance = rotation.targetYaw - rotation.yaw;
        const pitchDistance = rotation.targetPitch - rotation.pitch;
        rotation.yaw += yawDistance * 0.075;
        rotation.pitch += pitchDistance * 0.075;
        if (Math.abs(yawDistance) < 0.001 && Math.abs(pitchDistance) < 0.001) {
          rotation.targetYaw = null;
          rotation.targetPitch = null;
        }
      } else if (!dragRef.current) {
        rotation.yaw += rotation.velocityX;
        rotation.pitch = clamp(rotation.pitch + rotation.velocityY, -1.15, 1.15);
        rotation.velocityX *= 0.94;
        rotation.velocityY *= 0.9;
        if (!reduceMotion && time - rotation.lastInteraction > 3500) rotation.yaw -= 0.00035;
      }

      context.clearRect(0, 0, width, height);
      const compact = width <= 640;
      const radius = Math.min(
        width * (compact ? 0.44 : 0.355),
        height * (compact ? 0.42 : 0.5),
      ) * rotation.zoom;
      const centerX = width * (compact ? 0.5 : 0.67);
      const centerY = height * (compact ? 0.5 : 0.46);

      const glow = context.createRadialGradient(centerX, centerY, radius * 0.55, centerX, centerY, radius * 1.18);
      glow.addColorStop(0, "rgba(255,255,255,0.015)");
      glow.addColorStop(0.82, "rgba(255,255,255,0.01)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(centerX, centerY, radius * 1.18, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(255,255,255,0.13)";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(centerX, centerY, radius + 0.5, 0, Math.PI * 2);
      context.stroke();

      for (const point of landPoints) {
        const projected = project(point, rotation.yaw, rotation.pitch);
        if (projected.z <= -0.02) continue;
        const depth = clamp(projected.z, 0, 1);
        const dotSize = 0.7 + depth * 1.15;
        context.globalAlpha = 0.13 + depth * depth * 0.77;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(
          centerX + projected.x * radius,
          centerY - projected.y * radius,
          dotSize,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      context.globalAlpha = 1;

      const projectedChurches = churchPoints.map((point, index) => {
        const projected = project(point, rotation.yaw, rotation.pitch);
        const x = centerX + projected.x * radius;
        const y = centerY - projected.y * radius;
        const pin = pinRefs.current[index];
        if (pin) {
          const visible = projected.z > 0.04;
          pin.style.left = `${x}px`;
          pin.style.top = `${y}px`;
          pin.style.opacity = visible ? String(clamp((projected.z - 0.04) * 2.8, 0.25, 1)) : "0";
          pin.style.pointerEvents = visible ? "auto" : "none";
          pin.style.zIndex = String(Math.round(projected.z * 100) + 10);
          pin.classList.toggle("is-active", index === activeRef.current);
        }
        return { index, x, y, z: projected.z };
      });

      const visible = projectedChurches
        .filter((item) => item.z > 0.04)
        .sort((a, b) => {
          if (a.index === activeRef.current) return -1;
          if (b.index === activeRef.current) return 1;
          return b.z - a.z;
        });
      const accepted = [];
      const maxLabels = compact ? 1 : 4;

      for (const item of visible) {
        const label = labelRefs.current[item.index];
        if (!label) continue;
        const labelWidth = compact ? label.offsetWidth : item.index === activeRef.current ? 196 : 166;
        const labelX = compact ? clamp(item.x, labelWidth / 2 + 12, width - labelWidth / 2 - 12) : item.x;
        label.style.setProperty("--label-offset", `${labelX - item.x}px`);
        const box = {
          left: labelX - labelWidth / 2,
          right: labelX + labelWidth / 2,
          top: item.y - 72,
          bottom: item.y - 16,
        };
        const collides = accepted.some((other) => !(
          box.right + 10 < other.left
          || box.left - 10 > other.right
          || box.bottom + 8 < other.top
          || box.top - 8 > other.bottom
        ));
        const show = accepted.length < maxLabels && (!collides || item.index === activeRef.current);
        label.classList.toggle("is-shown", show);
        if (show) accepted.push(box);
      }

      for (const item of projectedChurches) {
        if (item.z <= 0.04) labelRefs.current[item.index]?.classList.remove("is-shown");
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);
    return () => {
      abortController.abort();
      observer.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rotation = rotationRef.current;
    rotation.targetYaw = null;
    rotation.targetPitch = null;
    rotation.velocityX = 0;
    rotation.velocityY = 0;
    rotation.lastInteraction = performance.now();
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.classList.add("is-dragging");
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    const rotation = rotationRef.current;
    rotation.yaw -= dx * 0.006;
    rotation.pitch = clamp(rotation.pitch + dy * 0.005, -1.15, 1.15);
    rotation.velocityX = -dx * 0.00075;
    rotation.velocityY = dy * 0.00065;
    rotation.lastInteraction = performance.now();
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event) => {
    dragRef.current = null;
    rotationRef.current.lastInteraction = performance.now();
    event.currentTarget.classList.remove("is-dragging");
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const rotation = rotationRef.current;
    rotation.zoom = clamp(rotation.zoom - event.deltaY * 0.0007, 0.82, 1.18);
    rotation.lastInteraction = performance.now();
  };

  const handleKeyDown = (event) => {
    const rotation = rotationRef.current;
    const step = event.shiftKey ? 0.2 : 0.09;
    if (event.key === "ArrowLeft") rotation.yaw += step;
    else if (event.key === "ArrowRight") rotation.yaw -= step;
    else if (event.key === "ArrowUp") rotation.pitch = clamp(rotation.pitch - step, -1.15, 1.15);
    else if (event.key === "ArrowDown") rotation.pitch = clamp(rotation.pitch + step, -1.15, 1.15);
    else return;
    event.preventDefault();
    rotation.targetYaw = null;
    rotation.targetPitch = null;
    rotation.lastInteraction = performance.now();
  };

  return (
    <div className="globe-shell">
      <div className="globe-meta globe-meta-top">
        <span>NATURAL EARTH / 1:110M</span>
        <span className="signal"><i /> LIVE MAP</span>
      </div>

      <div
        className="globe-stage"
        ref={stageRef}
        role="application"
        aria-label="Interactive globe of churches. Drag to rotate, use the mouse wheel to zoom, or use arrow keys."
        tabIndex="0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        {CHURCHES.map((church, index) => (
          <button
            type="button"
            className="church-pin"
            ref={(node) => { pinRefs.current[index] = node; }}
            key={church.id}
            onClick={(event) => {
              event.stopPropagation();
              chooseChurch(index);
            }}
            aria-label={`View ${church.name}, ${church.city}, ${church.country}`}
          >
            <span className="pin-label" ref={(node) => { labelRefs.current[index] = node; }}>
              <span className="pin-label-icon">✦</span>
              <span><strong>{church.shortName}</strong><small>{church.city}, {church.countryCode}</small></span>
            </span>
            <span className="pin-pulse" />
            <span className="pin-core" />
          </button>
        ))}
        <div className="globe-crosshair globe-crosshair-x" aria-hidden="true" />
        <div className="globe-crosshair globe-crosshair-y" aria-hidden="true" />
      </div>

      <div className="globe-meta globe-meta-bottom">
        <span><b>DRAG</b> TO ROTATE</span>
        <span><b>SCROLL</b> TO ZOOM</span>
        <span>{String(activeIndex + 1).padStart(2, "0")} / {String(CHURCHES.length).padStart(2, "0")}</span>
      </div>
    </div>
  );
}
