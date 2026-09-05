/**
 * 고급 원목 질감 바둑판 렌더러
 * 비자나무 나뭇결, 다크 월넛 베젤, 원형 펠트 받침대를 포함한 3D 바둑판 생성
 */

import * as THREE from 'three';
import { BOARD } from '../physics/GameEngine.js';

const WALNUT_DARK = 0x3D2410;
const KAYA_WOOD = 0xE9C587;
const FELT_GRAY = 0x4A4A4A;
const BOARD_THICK = 22;
const BEZEL_THICK = 8;
const FELT_THICK = 4;
const BOARD_RADIUS = 12; // 모서리 라운딩

export class BoardRenderer {
  constructor() {
    this.boardGroup = new THREE.Group();
    this.boardGroup.name = 'BoardGroup';
    
    // 텍스처 초기화
    this._initTextures();
    
    // 바둑판 구성 요소들 생성
    this._createFeltBase();
    this._createWoodBoard();
    this._createGridLines();
    this._createBezel();
    
    this.boardGroup.castShadow = true;
    this.boardGroup.receiveShadow = true;
  }

  /**
   * 원목 및 펠트 텍스처 생성
   */
  _initTextures() {
    // 비자나무 나뭇결 텍스처
    this.kayaTexture = this._createWoodTexture(KAYA_WOOD);
    
    // 다크 월넛 텍스처  
    this.walnutTexture = this._createWoodTexture(WALNUT_DARK);
    
    // 펠트 텍스처
    this.feltTexture = this._createFeltTexture();
    
    // 격자선을 위한 캔버스 텍스처
    this.gridTexture = this._createGridTexture();
  }

  /**
   * 비자나무 원목 텍스처 생성
   */
  _createWoodTexture(baseColor) {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const color = new THREE.Color(baseColor);
    
    // 기본 나무 배경색
    ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
    ctx.fillRect(0, 0, size, size);
    
    // 나뭇결 패턴 생성
    const grainCount = baseColor === KAYA_WOOD ? 32 : 24;
    for (let i = 0; i < grainCount; i++) {
      const y = (i / grainCount) * size + Math.sin(i * 2.3) * 8;
      const darkness = baseColor === KAYA_WOOD ? 0.15 : 0.25;
      const alpha = 0.3 + Math.random() * 0.4;
      
      // 나뭇결 라인
      ctx.strokeStyle = `rgba(0, 0, 0, ${darkness * alpha})`;
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      
      // 자연스러운 곡선 나뭇결
      const cp1x = size * 0.25 + Math.random() * size * 0.1;
      const cp1y = y + (Math.random() - 0.5) * 20;
      const cp2x = size * 0.75 + Math.random() * size * 0.1;
      const cp2y = y + (Math.random() - 0.5) * 20;
      
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, size, y + (Math.random() - 0.5) * 15);
      ctx.stroke();
    }
    
    // 나무 노이즈 추가
    for (let i = 0; i < 200; i++) {
      const darkness = baseColor === KAYA_WOOD ? 0.08 : 0.12;
      ctx.fillStyle = `rgba(0, 0, 0, ${darkness * Math.random()})`;
      ctx.fillRect(
        Math.random() * size, 
        Math.random() * size, 
        1 + Math.random() * 4, 
        1 + Math.random() * 2
      );
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.anisotropy = 16;
    
    return texture;
  }

  /**
   * 펠트 텍스처 생성
   */
  _createFeltTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // 펠트 기본색
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(0, 0, size, size);
    
    // 펠트 텍스처 노이즈
    for (let i = 0; i < 2000; i++) {
      const alpha = 0.02 + Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
      ctx.fillRect(
        Math.random() * size,
        Math.random() * size,
        Math.random() * 3,
        Math.random() * 3
      );
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    texture.anisotropy = 8;
    
    return texture;
  }

  /**
   * 격자선 텍스처 생성
   */
  _createGridTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // 투명 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, size, size);
    
    // 격자선 그리기 (레이저 각인 스타일)
    ctx.strokeStyle = '#3D2410';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    const gridSize = 19; // 바둑판 19x19
    const cellSize = size / gridSize;
    
    for (let i = 0; i < gridSize; i++) {
      const pos = (i + 0.5) * cellSize;
      
      // 세로선
      ctx.beginPath();
      ctx.moveTo(pos, cellSize * 0.5);
      ctx.lineTo(pos, size - cellSize * 0.5);
      ctx.stroke();
      
      // 가로선
      ctx.beginPath();
      ctx.moveTo(cellSize * 0.5, pos);
      ctx.lineTo(size - cellSize * 0.5, pos);
      ctx.stroke();
    }
    
    // 화점 (star points) 추가
    const starPoints = [
      [3, 3], [9, 3], [15, 3],
      [3, 9], [9, 9], [15, 9],
      [3, 15], [9, 15], [15, 15]
    ];
    
    ctx.fillStyle = '#3D2410';
    starPoints.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc((x + 0.5) * cellSize, (y + 0.5) * cellSize, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    texture.transparent = true;
    
    return texture;
  }

  /**
   * 원형 펠트 받침대 생성
   */
  _createFeltBase() {
    const radius = BOARD.outer.size * 0.6;
    const geometry = new THREE.CylinderGeometry(radius, radius, FELT_THICK, 64);
    
    const material = new THREE.MeshLambertMaterial({
      map: this.feltTexture,
      color: FELT_GRAY,
    });
    
    const feltBase = new THREE.Mesh(geometry, material);
    feltBase.position.set(0, -FELT_THICK / 2, 0);
    feltBase.receiveShadow = true;
    feltBase.name = 'FeltBase';
    
    this.boardGroup.add(feltBase);
  }

  /**
   * 원목 바둑판 본체 생성
   */
  _createWoodBoard() {
    // 라운딩된 사각형 형태의 바둑판
    const width = BOARD.inner.size;
    const height = BOARD_THICK;
    const depth = BOARD.inner.size;
    
    // BoxGeometry를 사용하되, 모서리를 라운딩하는 효과
    const geometry = new THREE.BoxGeometry(width, height, depth);
    
    const material = new THREE.MeshStandardMaterial({
      map: this.kayaTexture,
      color: KAYA_WOOD,
      roughness: 0.35,
      metalness: 0.05,
    });
    
    const board = new THREE.Mesh(geometry, material);
    board.position.set(0, height / 2, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    board.name = 'WoodBoard';
    
    this.boardGroup.add(board);
  }

  /**
   * 격자선 오버레이 생성
   */
  _createGridLines() {
    const width = BOARD.inner.size;
    const depth = BOARD.inner.size;
    
    const geometry = new THREE.PlaneGeometry(width, depth);
    const material = new THREE.MeshBasicMaterial({
      map: this.gridTexture,
      transparent: true,
      depthWrite: false,
    });
    
    const grid = new THREE.Mesh(geometry, material);
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(0, BOARD_THICK + 0.1, 0); // 바둑판 위에 살짝 띄워서 격자선 표시
    grid.name = 'GridLines';
    
    this.boardGroup.add(grid);
  }

  /**
   * 다크 월넛 베젤 (외곽 테두리) 생성
   */
  _createBezel() {
    const outerSize = BOARD.outer.size;
    const innerSize = BOARD.inner.size;
    const height = BOARD_THICK + BEZEL_THICK;
    
    // 베젤을 위한 복합 형태 생성 (외부 박스 - 내부 박스)
    const outerGeometry = new THREE.BoxGeometry(outerSize, height, outerSize);
    const innerGeometry = new THREE.BoxGeometry(innerSize, height + 2, innerSize);
    
    // CSG 없이 간단하게 테두리만 만들기 위해 4개의 직사각형으로 구성
    const bezelMaterial = new THREE.MeshStandardMaterial({
      map: this.walnutTexture,
      color: WALNUT_DARK,
      roughness: 0.25,
      metalness: 0.08,
    });
    
    const bezelThickness = (outerSize - innerSize) / 2;
    
    // 앞쪽 베젤
    const frontBezel = new THREE.BoxGeometry(outerSize, height, bezelThickness);
    const frontMesh = new THREE.Mesh(frontBezel, bezelMaterial);
    frontMesh.position.set(0, height / 2, (innerSize + bezelThickness) / 2);
    frontMesh.castShadow = true;
    frontMesh.receiveShadow = true;
    this.boardGroup.add(frontMesh);
    
    // 뒤쪽 베젤
    const backBezel = new THREE.BoxGeometry(outerSize, height, bezelThickness);
    const backMesh = new THREE.Mesh(backBezel, bezelMaterial);
    backMesh.position.set(0, height / 2, -(innerSize + bezelThickness) / 2);
    backMesh.castShadow = true;
    backMesh.receiveShadow = true;
    this.boardGroup.add(backMesh);
    
    // 좌측 베젤
    const leftBezel = new THREE.BoxGeometry(bezelThickness, height, innerSize);
    const leftMesh = new THREE.Mesh(leftBezel, bezelMaterial);
    leftMesh.position.set(-(innerSize + bezelThickness) / 2, height / 2, 0);
    leftMesh.castShadow = true;
    leftMesh.receiveShadow = true;
    this.boardGroup.add(leftMesh);
    
    // 우측 베젤
    const rightBezel = new THREE.BoxGeometry(bezelThickness, height, innerSize);
    const rightMesh = new THREE.Mesh(rightBezel, bezelMaterial);
    rightMesh.position.set((innerSize + bezelThickness) / 2, height / 2, 0);
    rightMesh.castShadow = true;
    rightMesh.receiveShadow = true;
    this.boardGroup.add(rightMesh);
  }

  /**
   * 바둑판 그룹 반환
   */
  getBoard() {
    return this.boardGroup;
  }

  /**
   * 바둑판 색상 업데이트
   */
  updateBoardColor(hexColor) {
    // 기존 텍스처 업데이트 로직
    this.kayaTexture.dispose();
    this.kayaTexture = this._createWoodTexture(new THREE.Color(hexColor).getHex());
    
    const board = this.boardGroup.getObjectByName('WoodBoard');
    if (board) {
      board.material.map = this.kayaTexture;
      board.material.color.setHex(new THREE.Color(hexColor).getHex());
      board.material.needsUpdate = true;
    }
  }

  /**
   * 리소스 정리
   */
  dispose() {
    this.kayaTexture?.dispose();
    this.walnutTexture?.dispose();
    this.feltTexture?.dispose();
    this.gridTexture?.dispose();
    
    this.boardGroup.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}