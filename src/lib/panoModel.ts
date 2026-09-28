/**
 * A 360 camera video as a space: the equirectangular video plays on the
 * inside of a sphere that stays centred on the camera, like a sky. Looking
 * round works in every mode; nothing walks off-centre and stretches the
 * picture (useSceneManager also holds walking speed at 0 for these).
 *
 * Returns the same handle as meshModel.ts, so the studio, hotspots, the
 * author transform (turn it to face the right way) and the tour treat it
 * like any space. It has no floor or walls to collide with.
 *
 * The video is muted (visitors' sound rules: nothing plays sound before a
 * tap) and streams by byte range; the first frame shows once enough of the
 * file has arrived to draw it. If the browser holds back autoplay, the
 * first tap anywhere starts it.
 */
import * as THREE from 'three';
import type { MeshModel } from './meshModel';

const RADIUS = 40; // m: well inside the camera's far plane

export function loadPanoVideo(url: string, onProgress: (p: number) => void): Promise<MeshModel> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.src = url;

  return new Promise((resolve, reject) => {
    const fail = () => { cleanup(); reject(new Error(`[pano] ${url} did not load`)); };
    const progress = () => {
      if (video.duration > 0 && video.buffered.length) onProgress(Math.min(0.95, video.buffered.end(0) / video.duration));
    };
    const ready = () => {
      cleanup();
      onProgress(1);
      resolve(panoHandle(video));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', fail);
      video.removeEventListener('progress', progress);
    };
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', fail);
    video.addEventListener('progress', progress);
    video.load();
  });
}

function panoHandle(video: HTMLVideoElement): MeshModel {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.SphereGeometry(RADIUS, 96, 48);
  geometry.scale(-1, 1, 1); // seen from inside
  // A 360 camera puts straight ahead at the middle of the frame; three's
  // sphere puts that point 90° to the side. Face it the way a space opens (−Z).
  geometry.rotateY(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: texture, depthWrite: false, toneMapped: false });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'pano-video';
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  const root = new THREE.Group();
  root.name = 'pano-model';
  root.add(sky);
  // Centred on whoever is looking: keep the space's turn (root), take the
  // camera's place. After three's own matrix update, before the draw.
  sky.onBeforeRender = (_r, _s, camera) => {
    sky.matrixWorld.copy(root.matrixWorld).setPosition(camera.matrixWorld.elements[12], camera.matrixWorld.elements[13], camera.matrixWorld.elements[14]);
  };

  const play = () => { video.play().catch(() => { /* waits for a tap */ }); };
  const onTap = () => { if (video.paused) play(); };
  window.addEventListener('pointerdown', onTap);
  const onVisibility = () => { if (document.hidden) video.pause(); else play(); };
  document.addEventListener('visibilitychange', onVisibility);
  play();

  // A small box round the centre: bounds drive the far plane and scale
  // guesses, and a 360 space is metric by definition.
  const half = 4;
  const wb = new THREE.Box3();
  return {
    root,
    getBounds() {
      wb.set(new THREE.Vector3(-half, -half, -half), new THREE.Vector3(half, half, half)).applyMatrix4(root.matrixWorld);
      return { min: { x: wb.min.x, y: wb.min.y, z: wb.min.z }, max: { x: wb.max.x, y: wb.max.y, z: wb.max.z } };
    },
    intersectsCapsule: () => ({ hit: false }),
    hasCollision: () => false,
    dispose() {
      window.removeEventListener('pointerdown', onTap);
      document.removeEventListener('visibilitychange', onVisibility);
      video.pause();
      video.removeAttribute('src');
      video.load();
      texture.dispose();
      geometry.dispose();
      material.dispose();
      root.removeFromParent();
    }
  };
}
