import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';

const RobotScene = forwardRef(({ isListening }, ref) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const robotRef = useRef(null);
  const animationRef = useRef({
    isSpeaking: false,
    speakingDuration: 0,
    speakingProgress: 0,
    eyeBlinkTimer: 0,
    eyeBlinkDuration: 0.3,
    mouthOpen: 0,
    headRotation: 0,
  });

  useImperativeHandle(ref, () => ({
    startSpeaking: (duration) => {
      console.log('RobotScene.startSpeaking called with duration:', duration);
      animationRef.current.isSpeaking = true;
      animationRef.current.speakingDuration = duration;
      animationRef.current.speakingProgress = 0;
    },
    stopSpeaking: () => {
      console.log('RobotScene.stopSpeaking called');
      animationRef.current.isSpeaking = false;
    }
  }));

  useEffect(() => {
    // Setup scene
    const scene = new THREE.Scene();

    // Add retro space background gradient
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Gradient background: deep space theme
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#1a1a3e');
    gradient.addColorStop(0.5, '#2d5a7b');
    gradient.addColorStop(1, '#1a3a52');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    // Add some stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random() * 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    scene.background = texture;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create robot
    const { robot, head, mouth, leftArm, rightArm } = createRobot();
    scene.add(robot);
    robotRef.current = { robot, head, mouth, leftArm, rightArm };

    // Animation loop
    let frameCount = 0;
    const animate = () => {
      requestAnimationFrame(animate);

      if (animationRef.current.isSpeaking) {
        animationRef.current.speakingProgress += 0.016 / animationRef.current.speakingDuration;

        // Mouth open/close (simulate talking)
        const mouthOpenness = Math.sin(animationRef.current.speakingProgress * Math.PI * 4) * 0.5 + 0.3;
        animationRef.current.mouthOpen = Math.max(0, mouthOpenness);

        // Subtle head movements while speaking
        animationRef.current.headRotation = Math.sin(animationRef.current.speakingProgress * Math.PI * 2) * 0.15;

        if (frameCount % 30 === 0) {
          console.log('Speaking progress:', animationRef.current.speakingProgress.toFixed(3), 'mouth:', animationRef.current.mouthOpen.toFixed(3));
        }

        if (animationRef.current.speakingProgress >= 1) {
          animationRef.current.isSpeaking = false;
          animationRef.current.mouthOpen = 0;
          animationRef.current.headRotation = 0;
          console.log('Speaking finished');
        }
      } else {
        // Idle state - gentle breathing
        const time = Date.now() * 0.001;
        animationRef.current.mouthOpen = Math.sin(time * 0.5) * 0.05;
        animationRef.current.headRotation = Math.sin(time * 0.3) * 0.03;
      }

      frameCount++;

      // Eye blink
      animationRef.current.eyeBlinkTimer += 0.016;
      if (animationRef.current.eyeBlinkTimer > 3) {
        animationRef.current.eyeBlinkTimer = 0;
      }

      // Apply animations to robot
      updateRobotAnimation(robotRef.current, animationRef.current, isListening);

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [isListening]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});

function createRobot() {
  const group = new THREE.Group();
  let head, mouth, leftArm, rightArm;

  const lightBlue = 0x87ceeb;
  const coral = 0xff6b35;

  // Base with wheels (Jetsons style)
  const baseGeom = new THREE.CylinderGeometry(0.7, 0.7, 0.3, 32);
  const baseMat = new THREE.MeshStandardMaterial({ color: lightBlue, metalness: 0.5, roughness: 0.5 });
  const base = new THREE.Mesh(baseGeom, baseMat);
  base.position.y = -0.65;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Left wheel
  const wheelGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
  const leftWheel = new THREE.Mesh(wheelGeom, wheelMat);
  leftWheel.rotation.z = Math.PI / 2;
  leftWheel.position.set(-0.55, -0.8, 0);
  leftWheel.castShadow = true;
  group.add(leftWheel);

  // Right wheel
  const rightWheel = new THREE.Mesh(wheelGeom, wheelMat);
  rightWheel.rotation.z = Math.PI / 2;
  rightWheel.position.set(0.55, -0.8, 0);
  rightWheel.castShadow = true;
  group.add(rightWheel);

  // Body (rounded cylinder for Jetsons look)
  const bodyGeom = new THREE.CylinderGeometry(0.5, 0.55, 1.3, 32);
  const bodyMat = new THREE.MeshStandardMaterial({ color: lightBlue, metalness: 0.6, roughness: 0.4 });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Body accent stripe
  const stripeGeom = new THREE.CylinderGeometry(0.52, 0.57, 0.1, 32);
  const stripeMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.7, roughness: 0.3 });
  const stripe = new THREE.Mesh(stripeGeom, stripeMat);
  stripe.position.y = 0.8;
  stripe.castShadow = true;
  group.add(stripe);

  // Head (large round sphere)
  const headGeom = new THREE.SphereGeometry(0.5, 32, 32);
  const headMat = new THREE.MeshStandardMaterial({ color: lightBlue, metalness: 0.6, roughness: 0.4 });
  head = new THREE.Mesh(headGeom, headMat);
  head.position.y = 1.15;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // Left antenna/ear
  const antennaGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 16);
  const antennaMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.7, roughness: 0.3 });
  const leftAntenna = new THREE.Mesh(antennaGeom, antennaMat);
  leftAntenna.position.set(-0.25, 1.65, 0);
  leftAntenna.castShadow = true;
  group.add(leftAntenna);

  // Right antenna/ear
  const rightAntenna = new THREE.Mesh(antennaGeom, antennaMat);
  rightAntenna.position.set(0.25, 1.65, 0);
  rightAntenna.castShadow = true;
  group.add(rightAntenna);

  // Antenna tips (small spheres)
  const tipGeom = new THREE.SphereGeometry(0.1, 16, 16);
  const tipMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.9, roughness: 0.1 });
  const leftTip = new THREE.Mesh(tipGeom, tipMat);
  leftTip.position.set(-0.25, 2.05, 0);
  group.add(leftTip);

  const rightTip = new THREE.Mesh(tipGeom, tipMat);
  rightTip.position.set(0.25, 2.05, 0);
  group.add(rightTip);

  // Eyes (large and expressive)
  const eyeGeom = new THREE.SphereGeometry(0.15, 16, 16);
  const eyeMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.8, roughness: 0.2 });

  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(-0.18, 1.3, 0.45);
  leftEye.castShadow = true;
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(0.18, 1.3, 0.45);
  rightEye.castShadow = true;
  group.add(rightEye);

  // Nose (small orange sphere)
  const noseGeom = new THREE.SphereGeometry(0.08, 16, 16);
  const noseMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.7, roughness: 0.3 });
  const nose = new THREE.Mesh(noseGeom, noseMat);
  nose.position.set(0, 1.05, 0.5);
  nose.castShadow = true;
  group.add(nose);

  // Mouth (curved smile)
  const mouthGeom = new THREE.TorusGeometry(0.2, 0.05, 8, 16, 0, Math.PI);
  const mouthMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.7, roughness: 0.3 });
  mouth = new THREE.Mesh(mouthGeom, mouthMat);
  mouth.position.set(0, 0.8, 0.48);
  mouth.rotation.x = Math.PI / 2;
  group.add(mouth);

  // Left arm (with hand)
  const armGeom = new THREE.BoxGeometry(0.12, 0.9, 0.12);
  const armMat = new THREE.MeshStandardMaterial({ color: lightBlue, metalness: 0.6, roughness: 0.4 });

  leftArm = new THREE.Mesh(armGeom, armMat);
  leftArm.position.set(-0.65, 0.5, 0);
  leftArm.castShadow = true;
  leftArm.receiveShadow = true;
  group.add(leftArm);

  // Left hand
  const handGeom = new THREE.SphereGeometry(0.12, 16, 16);
  const handMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.7, roughness: 0.3 });
  const leftHand = new THREE.Mesh(handGeom, handMat);
  leftHand.position.set(-0.65, -0.1, 0);
  leftHand.castShadow = true;
  group.add(leftHand);

  // Right arm
  rightArm = new THREE.Mesh(armGeom, armMat);
  rightArm.position.set(0.65, 0.5, 0);
  rightArm.castShadow = true;
  rightArm.receiveShadow = true;
  group.add(rightArm);

  // Right hand
  const rightHand = new THREE.Mesh(handGeom, handMat);
  rightHand.position.set(0.65, -0.1, 0);
  rightHand.castShadow = true;
  group.add(rightHand);

  // Apron (white fabric-like panel)
  const apronGeom = new THREE.PlaneGeometry(0.8, 1.0);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    metalness: 0.2,
    roughness: 0.8,
    side: THREE.DoubleSide
  });
  const apron = new THREE.Mesh(apronGeom, apronMat);
  apron.position.set(0, 0.3, 0.52);
  apron.castShadow = true;
  group.add(apron);

  // Apron waistband (red/coral belt)
  const beltGeom = new THREE.BoxGeometry(0.85, 0.15, 0.1);
  const beltMat = new THREE.MeshStandardMaterial({ color: coral, metalness: 0.7, roughness: 0.3 });
  const belt = new THREE.Mesh(beltGeom, beltMat);
  belt.position.set(0, 0.95, 0.5);
  belt.castShadow = true;
  group.add(belt);

  // Duster in right hand
  // Handle (thin cylinder)
  const handleGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 16);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, metalness: 0.3, roughness: 0.7 });
  const dusterHandle = new THREE.Mesh(handleGeom, handleMat);
  dusterHandle.position.set(0.75, 0.1, 0);
  dusterHandle.rotation.z = Math.PI / 6; // Slight angle
  dusterHandle.castShadow = true;
  group.add(dusterHandle);

  // Duster head (fluffy cloud)
  const dusterHeadGeom = new THREE.IcosahedronGeometry(0.25, 3);
  const dusterMat = new THREE.MeshStandardMaterial({
    color: 0xffeb3b,
    metalness: 0.1,
    roughness: 0.9
  });
  const dusterHead = new THREE.Mesh(dusterHeadGeom, dusterMat);
  dusterHead.position.set(0.8, 0.45, 0);
  dusterHead.scale.set(1.2, 1.2, 0.8); // Make it fluffy looking
  dusterHead.castShadow = true;
  group.add(dusterHead);

  group.scale.set(1.15, 1.15, 1.15);
  return { robot: group, head, mouth, leftArm, rightArm };
}

function updateRobotAnimation(robotParts, animation, isListening) {
  if (!robotParts || !robotParts.robot) return;

  const { robot, head, mouth, leftArm, rightArm } = robotParts;

  // Head rotation
  if (head) {
    head.rotation.y = animation.headRotation;
  }

  // Mouth open/close
  if (mouth) {
    mouth.scale.y = 1 + animation.mouthOpen * 2;
  }

  // Arms gesture
  if (leftArm) {
    if (animation.isSpeaking) {
      const armRotation = Math.sin(animation.speakingProgress * Math.PI * 3) * 0.3;
      leftArm.rotation.z = armRotation;
    } else {
      leftArm.rotation.z = 0;
    }
  }
  if (rightArm) {
    if (animation.isSpeaking) {
      const armRotation = Math.sin(animation.speakingProgress * Math.PI * 3) * 0.3;
      rightArm.rotation.z = -armRotation;
    } else {
      rightArm.rotation.z = 0;
    }
  }

  // Slight body sway when listening
  if (isListening) {
    const time = Date.now() * 0.001;
    robot.rotation.z = Math.sin(time * 0.8) * 0.05;
  } else {
    robot.rotation.z = 0;
  }
}

export default RobotScene;
