/**
 * 고급 쿼터뷰 씬 매니저
 * 다이내믹 카메라, 고급 조명, 그림자 시스템 관리
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../physics/GameEngine.js';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    
    // Three.js 기본 설정
    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initLighting();
    this._initEnvironment();
    
    // 카메라 컨트롤 상태
    this.cameraOffset = { x: 0, y: 0, z: 0 };
    this.cameraRotation = { x: 0, y: 0 };
    this.isSpectatorMode = false;
  }

  /**
   * 렌더러 초기화 - 고품질 설정
   */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    
    // 고품질 렌더링 설정
    this.renderer.setSize(VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 부드러운 그림자
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    // 물리 기반 렌더링 활성화
    this.renderer.physicallyCorrectLights = true;
  }

  /**
   * 씬 초기화
   */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0A0505); // 어두운 배경
    this.scene.fog = new THREE.Fog(0x0A0505, 50, 200); // 자연스러운 안개 효과
  }

  /**
   * 쿼터뷰 카메라 설정
   */
  _initCamera() {
    // 다이내믹 쿼터뷰 (FOV 45도)
    this.camera = new THREE.PerspectiveCamera(
      45, // FOV
      VIRTUAL_WIDTH / VIRTUAL_HEIGHT, // aspect ratio
      0.1, // near
      1000 // far
    );
    
    // 카메라 위치: 전방 35-45도 경사의 쿼터뷰
    const distance = 450;
    const height = 280;
    const angle = Math.PI * 0.25; // 45도 회전
    
    this.camera.position.set(
      Math.sin(angle) * distance,
      height,
      Math.cos(angle) * distance
    );
    
    // 바둑판 중앙을 바라보도록 설정
    this.camera.lookAt(0, 0, 0);
    
    // 기본 카메라 위치 저장
    this.defaultCameraPosition = this.camera.position.clone();
    this.defaultCameraRotation = this.camera.rotation.clone();
  }

  /**
   * 고급 조명 시스템 설정
   */
  _initLighting() {
    // 1. Key Light - 대각선 상단에서 내리쬐는 메인 조명
    this.keyLight = new THREE.DirectionalLight(0xFFE6CC, 2.5);
    this.keyLight.position.set(200, 300, 150);
    this.keyLight.target.position.set(0, 0, 0);
    
    // 고품질 그림자 설정
    this.keyLight.castShadow = true;
    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 800;
    this.keyLight.shadow.camera.left = -400;
    this.keyLight.shadow.camera.right = 400;
    this.keyLight.shadow.camera.top = 400;
    this.keyLight.shadow.camera.bottom = -400;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.radius = 4;
    
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);
    
    // 2. Fill Light - 반대편에서 은은한 보조 조명
    this.fillLight = new THREE.DirectionalLight(0xB8E6FF, 0.8);
    this.fillLight.position.set(-150, 200, -100);
    this.scene.add(this.fillLight);
    
    // 3. Rim Light - 가장자리 하이라이트
    this.rimLight = new THREE.DirectionalLight(0xFFD4A3, 1.2);
    this.rimLight.position.set(-100, 150, 200);
    this.scene.add(this.rimLight);
    
    // 4. Ambient Light - 전체 환경광 (낮게 설정)
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(this.ambientLight);
    
    // 5. Hemisphere Light - 하늘과 지면 간접광
    this.hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x8B4513, 0.4);
    this.scene.add(this.hemisphereLight);
  }

  /**
   * 환경 반사 설정
   */
  _initEnvironment() {
    // Room Environment for realistic reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    
    const roomEnvironment = new RoomEnvironment();
    const envMap = pmremGenerator.fromScene(roomEnvironment).texture;
    
    this.scene.environment = envMap;
    
    pmremGenerator.dispose();
  }

  /**
   * 관전 모드 카메라 전환
   */
  enableSpectatorMode(smooth = true) {
    this.isSpectatorMode = true;
    
    if (smooth) {
      this._animateCamera(
        { x: 0, y: 350, z: 200 }, // 더 높은 위치에서 관전
        { x: -0.8, y: 0, z: 0 }   // 살짝 내려다보는 각도
      );
    } else {
      this.camera.position.set(0, 350, 200);
      this.camera.lookAt(0, 0, 0);
    }
  }

  /**
   * 일반 모드 카메라 복구
   */
  disableSpectatorMode(smooth = true) {
    this.isSpectatorMode = false;
    
    if (smooth) {
      this._animateCamera(
        this.defaultCameraPosition,
        this.defaultCameraRotation
      );
    } else {
      this.camera.position.copy(this.defaultCameraPosition);
      this.camera.rotation.copy(this.defaultCameraRotation);
    }
  }

  /**
   * 카메라 애니메이션
   */
  _animateCamera(targetPosition, targetRotation, duration = 1000) {
    const startPosition = this.camera.position.clone();
    const startRotation = this.camera.rotation.clone();
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-in-out)
      const eased = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      // 위치 보간
      this.camera.position.lerpVectors(startPosition, targetPosition, eased);
      
      // 회전 보간  
      this.camera.rotation.x = THREE.MathUtils.lerp(startRotation.x, targetRotation.x, eased);
      this.camera.rotation.y = THREE.MathUtils.lerp(startRotation.y, targetRotation.y, eased);
      this.camera.rotation.z = THREE.MathUtils.lerp(startRotation.z, targetRotation.z, eased);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  /**
   * 관전 모드에서 카메라 컨트롤 (줌, 회전)
   */
  updateSpectatorCamera(deltaX, deltaY, zoom) {
    if (!this.isSpectatorMode) return;
    
    // 회전 업데이트
    this.cameraRotation.y += deltaX * 0.01;
    this.cameraRotation.x = THREE.MathUtils.clamp(
      this.cameraRotation.x + deltaY * 0.01,
      -Math.PI / 3,  // 위로 60도 제한
      Math.PI / 6    // 아래로 30도 제한
    );
    
    // 줌 업데이트
    const distance = Math.max(150, Math.min(500, this.camera.position.length() + zoom * 10));
    
    // 새로운 위치 계산
    const x = Math.sin(this.cameraRotation.y) * Math.cos(this.cameraRotation.x) * distance;
    const y = Math.sin(this.cameraRotation.x) * distance + 200;
    const z = Math.cos(this.cameraRotation.y) * Math.cos(this.cameraRotation.x) * distance;
    
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * 조명 강도 조절 (하루 중 시간 시뮬레이션)
   */
  updateLightingIntensity(timeOfDay = 0.5) {
    // 0.0 = 새벽, 0.5 = 정오, 1.0 = 저녁
    const intensity = 0.5 + Math.sin(timeOfDay * Math.PI) * 0.5;
    
    this.keyLight.intensity = 2.0 + intensity * 1.0;
    this.fillLight.intensity = 0.6 + intensity * 0.4;
    this.rimLight.intensity = 1.0 + intensity * 0.5;
    
    // 색온도 변화
    if (timeOfDay < 0.3 || timeOfDay > 0.7) {
      // 따뜻한 빛 (아침/저녁)
      this.keyLight.color.setHex(0xFFE6CC);
      this.fillLight.color.setHex(0xFFB366);
    } else {
      // 차가운 빛 (정오)
      this.keyLight.color.setHex(0xF0F8FF);
      this.fillLight.color.setHex(0xB8E6FF);
    }
  }

  /**
   * 씬에 오브젝트 추가
   */
  add(object) {
    this.scene.add(object);
  }

  /**
   * 씬에서 오브젝트 제거
   */
  remove(object) {
    this.scene.remove(object);
  }

  /**
   * 렌더링 실행
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 리사이즈 처리
   */
  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * 리소스 정리
   */
  dispose() {
    this.renderer.dispose();
    
    // 조명 정리
    this.scene.remove(this.keyLight);
    this.scene.remove(this.fillLight);
    this.scene.remove(this.rimLight);
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.hemisphereLight);
    
    // 환경맵 정리
    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
  }

  /**
   * 씬, 카메라, 렌더러 접근자
   */
  getScene() { return this.scene; }
  getCamera() { return this.camera; }
  getRenderer() { return this.renderer; }
}