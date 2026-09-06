import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const COLORS = {
  sea: '#17140f', stone: '#c9b48a', pavement: '#c9b48a', road: '#625c4d',
  cream: '#efe6cf', sage: '#c9b48a', mint: '#6f8f4c', amber: '#c8391f',
  roof: '#625947', foliage: '#7d8860', trunk: '#806749', window: '#f2b544',
}
const DISTRICT_PALETTES = [
  { walls: ['#efe6cf', '#dcd2b9', '#e4d7b9'], roofs: ['#70634d', '#857557', '#b5a179'] },
]

function randomFor(text) {
  let seed = 2166136261
  for (const character of text) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  return () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507)
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909)
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296
  }
}

function roofGeometry() {
  const vertices = [
    -.5, -.5, -.5, .5, -.5, -.5, 0, .5, -.5,
    -.5, -.5, .5, 0, .5, .5, .5, -.5, .5,
    -.5, -.5, -.5, 0, .5, -.5, 0, .5, .5,
    -.5, -.5, -.5, 0, .5, .5, -.5, -.5, .5,
    .5, -.5, -.5, .5, -.5, .5, 0, .5, .5,
    .5, -.5, -.5, 0, .5, .5, 0, .5, -.5,
    -.5, -.5, -.5, -.5, -.5, .5, .5, -.5, .5,
    -.5, -.5, -.5, .5, -.5, .5, .5, -.5, -.5,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

function slabGeometry(width, depth, height, bevel = .2) {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const corner = Math.min(width, depth) * .075
  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth + corner, -halfDepth)
  shape.lineTo(halfWidth - corner, -halfDepth)
  shape.lineTo(halfWidth, -halfDepth + corner)
  shape.lineTo(halfWidth, halfDepth - corner)
  shape.lineTo(halfWidth - corner, halfDepth)
  shape.lineTo(-halfWidth + corner, halfDepth)
  shape.lineTo(-halfWidth, halfDepth - corner)
  shape.lineTo(-halfWidth, -halfDepth + corner)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 1, steps: 1, curveSegments: 1,
  })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/**
 * A deterministic, repository-backed miniature. The scene owns only its camera,
 * presentation and decorative traffic. All file/run state comes from the caller.
 */
export function createCityScene(container, {
  model, onSelect = () => {}, onHover = () => {}, onReady = () => {}, onError = () => {}, onVisitDistrict = () => {},
}) {
  const noop = () => {}
  const emptyController = {
    setSelection: noop, setActivity: noop, setDistrict: noop, setTime: noop,
    setOrbit: noop, setScout: noop, travelTo: noop, setStatus: noop,
    fit: noop, zoom: noop, focus: noop, captureView: () => null, restoreView: noop, destroy: noop,
  }
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  } catch (error) {
    onError(error)
    return emptyController
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.16
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;'
  renderer.domElement.setAttribute('aria-label', 'Interactive repository city. Drag to orbit, scroll to zoom, select a building to explore a file.')
  renderer.domElement.setAttribute('role', 'img')
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.sea)
  const camera = new THREE.OrthographicCamera(-24, 24, 24, -24, .1, 500)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = .075
  controls.enablePan = true
  controls.minPolarAngle = .25
  controls.maxPolarAngle = Math.PI * .445
  controls.minZoom = .55
  controls.maxZoom = 5
  controls.rotateSpeed = .45
  controls.zoomSpeed = .75
  controls.autoRotateSpeed = .25
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reducedMotion = motionQuery.matches
  let orbitRequested = false
  const onMotionChange = () => {
    reducedMotion = motionQuery.matches
    controls.autoRotate = orbitRequested && !reducedMotion && !scoutEnabled
  }
  motionQuery.addEventListener('change', onMotionChange)

  const ambient = new THREE.HemisphereLight('#c8d0d8', '#59452e', .85)
  scene.add(ambient)
  const sunlight = new THREE.DirectionalLight('#ffd599', 3.1)
  sunlight.position.set(-24, 36, 12)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  sunlight.shadow.bias = -.0004
  sunlight.shadow.normalBias = .08
  sunlight.shadow.radius = 3
  scene.add(sunlight)
  const fillLight = new THREE.DirectionalLight('#abc1cd', .36)
  fillLight.position.set(20, 16, -30)
  scene.add(fillLight)

  const districts = model?.districts || []
  const buildings = model?.buildings || []
  const fileMap = new Map(buildings.map(building => [building.path, building]))
  const districtMap = new Map(districts.map(district => [district.id, district]))
  const districtPalettes = new Map(districts.map((district, index) => [district.id, DISTRICT_PALETTES[index % DISTRICT_PALETTES.length]]))
  const visualHeights = new Map()
  const heightOf = building => visualHeights.get(building.path) ?? building.height
  const bounds = new THREE.Box2()
  for (const district of districts) {
    const radius = district.size / 2 + 1
    bounds.expandByPoint(new THREE.Vector2(district.x - radius, district.z - radius))
    bounds.expandByPoint(new THREE.Vector2(district.x + radius, district.z + radius))
  }
  for (const building of buildings) {
    bounds.expandByPoint(new THREE.Vector2(building.x - building.width, building.z - building.depth))
    bounds.expandByPoint(new THREE.Vector2(building.x + building.width, building.z + building.depth))
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector2(-6, -6), new THREE.Vector2(6, 6))
  const worldCenter = bounds.getCenter(new THREE.Vector2())
  const worldSize = bounds.getSize(new THREE.Vector2()).addScalar(3)
  const extent = Math.max(worldSize.x, worldSize.y, 16)
  sunlight.position.add(new THREE.Vector3(worldCenter.x, 0, worldCenter.y))
  sunlight.target.position.set(worldCenter.x, 0, worldCenter.y)
  scene.add(sunlight.target)
  Object.assign(sunlight.shadow.camera, {
    left: -extent * .8, right: extent * .8, top: extent * .8,
    bottom: -extent * .8, far: extent * 5,
  })
  sunlight.shadow.camera.updateProjectionMatrix()

  const resources = new Set()
  const own = resource => { resources.add(resource); return resource }
  const architectureMaterial = own(new THREE.MeshStandardMaterial({ roughness: .98, metalness: 0 }))
  const windowMaterial = own(new THREE.MeshBasicMaterial({ color: '#fff0d1', toneMapped: false }))
  const signalMaterial = own(new THREE.MeshBasicMaterial({ toneMapped: false }))
  const boxGeometry = own(new THREE.BoxGeometry(1, 1, 1))
  const cylinderGeometry = own(new THREE.CylinderGeometry(1, 1, 1, 10))
  const coneGeometry = own(new THREE.ConeGeometry(1, 1, 7))
  const leafGeometry = own(new THREE.IcosahedronGeometry(1, 0))
  const gableGeometry = own(roofGeometry())
  const pools = []
  const interactiveMeshes = []
  const color = new THREE.Color()
  const transform = new THREE.Object3D()

  function pool(geometry, material, castShadow = true) {
    const entries = []
    const item = {
      add(x, y, z, width, height, depth, tint, path = null, angle = 0) {
        entries.push({ x, y, z, width, height, depth, tint, path, angle })
      },
      build() {
        if (!entries.length) return null
        const mesh = new THREE.InstancedMesh(geometry, material, entries.length)
        entries.forEach((entry, index) => {
          transform.position.set(entry.x, entry.y, entry.z)
          transform.scale.set(entry.width, entry.height, entry.depth)
          transform.rotation.set(0, entry.angle, 0)
          transform.updateMatrix()
          mesh.setMatrixAt(index, transform.matrix)
          mesh.setColorAt(index, color.set(entry.tint))
        })
        mesh.instanceMatrix.needsUpdate = true
        mesh.instanceColor.needsUpdate = true
        mesh.castShadow = castShadow
        mesh.receiveShadow = castShadow
        mesh.userData.entries = entries
        scene.add(mesh)
        item.mesh = mesh
        return mesh
      },
      entries,
    }
    pools.push(item)
    return item
  }
  const boxes = pool(boxGeometry, architectureMaterial)
  const cylinders = pool(cylinderGeometry, architectureMaterial)
  const cones = pool(coneGeometry, architectureMaterial)
  const leaves = pool(leafGeometry, architectureMaterial)
  const roofs = pool(gableGeometry, architectureMaterial)
  const windows = pool(boxGeometry, windowMaterial, false)
  const signals = pool(boxGeometry, signalMaterial, false)
  const lampCircle = own(new THREE.CircleGeometry(1, 20))
  lampCircle.rotateX(-Math.PI / 2)
  const lampPoolMaterial = own(new THREE.MeshBasicMaterial({ color: '#ffd492', transparent: true, opacity: .07, depthWrite: false }))
  const lampPools = pool(lampCircle, lampPoolMaterial, false)

  const foundation = new THREE.Mesh(
    own(slabGeometry(worldSize.x, worldSize.y, .85, .25)),
    [own(new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 1 })), own(new THREE.MeshStandardMaterial({ color: '#8d6e45', roughness: 1 }))],
  )
  foundation.position.set(worldCenter.x, -1.14, worldCenter.y)
  foundation.receiveShadow = true
  foundation.castShadow = true
  scene.add(foundation)

  // A real receiving surface anchors the model under its desk lamp. The grid
  // is drawn locally, as on a cutting mat; there are no fetched art assets.
  const benchCanvas = document.createElement('canvas')
  benchCanvas.width = 1024
  benchCanvas.height = 1024
  const benchInk = benchCanvas.getContext('2d')
  benchInk.fillStyle = '#17140f'
  benchInk.fillRect(0, 0, 1024, 1024)
  for (let offset = 0; offset < 1024; offset += 64) {
    benchInk.strokeStyle = offset % 256 ? '#211d16' : '#2b251b'
    benchInk.lineWidth = 1
    benchInk.beginPath()
    benchInk.moveTo(offset, 0)
    benchInk.lineTo(offset, 1024)
    benchInk.moveTo(0, offset)
    benchInk.lineTo(1024, offset)
    benchInk.stroke()
  }
  const benchTexture = own(new THREE.CanvasTexture(benchCanvas))
  benchTexture.colorSpace = THREE.SRGBColorSpace
  benchTexture.wrapS = benchTexture.wrapT = THREE.RepeatWrapping
  benchTexture.repeat.set(800 / 32, 800 / 32)
  benchTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  const benchMaterial = own(new THREE.MeshStandardMaterial({ map: benchTexture, roughness: .95 }))
  const bench = new THREE.Mesh(own(new THREE.PlaneGeometry(800, 800)), benchMaterial)
  bench.rotation.x = -Math.PI / 2
  bench.position.y = -1.45
  bench.receiveShadow = true
  scene.add(bench)
  const deskLamp = new THREE.SpotLight('#f2b544', extent * extent * 1.8, extent * 4, Math.PI / 3.5, .82, 2)
  deskLamp.position.set(worldCenter.x - extent * .42, extent * .9, worldCenter.y - extent * .25)
  deskLamp.target.position.set(worldCenter.x, -1.4, worldCenter.y)
  scene.add(deskLamp, deskLamp.target)

  const labelLayer = document.createElement('div')
  labelLayer.className = 'city-label-layer'
  labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;'
  container.appendChild(labelLayer)
  const labels = []
  const roads = []
  const districtMeshes = []

  function tree(x, z, scale, random) {
    cylinders.add(x, .25 + scale * .36, z, .055 * scale, scale * .72, .055 * scale, COLORS.trunk)
    if (random() > .4) {
      leaves.add(x, .35 + scale * .95, z, scale * .43, scale * .7, scale * .43, random() > .4 ? '#7d8860' : '#9d9e72')
    } else {
      cones.add(x, .35 + scale * .88, z, scale * .4, scale * 1.3, scale * .4, COLORS.foliage)
      cones.add(x, .45 + scale * 1.12, z, scale * .3, scale * .9, scale * .3, '#8c9469')
    }
  }

  for (const district of districts) {
    const random = randomFor(district.id)
    const size = district.size
    const slab = new THREE.Mesh(
      own(slabGeometry(size, size, .29, .11)),
      own(new THREE.MeshStandardMaterial({ color: '#ded1ad', roughness: 1 })),
    )
    slab.position.set(district.x, -.26, district.z)
    slab.castShadow = true
    slab.receiveShadow = true
    slab.userData.districtId = district.id
    scene.add(slab)
    districtMeshes.push(slab)
    const edge = size / 2 - .48
    const roadWidth = .6
    for (const sign of [-1, 1]) {
      boxes.add(district.x + sign * edge, .135, district.z, roadWidth, .025, edge * 2, COLORS.road)
      boxes.add(district.x, .137, district.z + sign * edge, edge * 2, .025, roadWidth, COLORS.road)
      for (let offset = -edge + .5; offset < edge; offset += .9) {
        boxes.add(district.x + offset, .154, district.z + sign * edge, .25, .012, .028, '#9aab91')
        boxes.add(district.x + sign * edge, .154, district.z + offset, .028, .012, .25, '#9aab91')
      }
    }
    roads.push({ x: district.x, z: district.z, edge, phase: random() })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lampX = district.x + sx * (edge - .36)
      const lampZ = district.z + sz * (edge - .36)
      cylinders.add(lampX, .7, lampZ, .026, 1.1, .026, '#354d44')
      boxes.add(lampX, 1.25, lampZ, .2, .045, .2, '#40594c')
      signals.add(lampX, 1.19, lampZ, .115, .1, .115, '#ffd695')
      lampPools.add(lampX, .153, lampZ, .63, 1, .63, '#ffd492')
    }

    // Plant only vacant edge lots; every occupied lot remains a real file.
    const districtFiles = buildings.filter(building => building.districtId === district.id)
    const isVacant = (x, z) => !districtFiles.some(building => Math.abs(building.x - x) < building.width / 2 + .38 && Math.abs(building.z - z) < building.depth / 2 + .38)
    for (let index = 0; index < Math.min(28, size * 2); index++) {
      const side = index % 4
      const across = (random() - .5) * (size - 2)
      const inset = size / 2 - 1.1
      const x = district.x + (side < 2 ? (side ? -inset : inset) : across)
      const z = district.z + (side >= 2 ? (side === 3 ? -inset : inset) : across)
      if (isVacant(x, z)) {
        cylinders.add(x, .18, z, .29, .07, .29, '#576e57')
        tree(x, z, .65 + random() * .4, random)
      }
    }
    // A narrow illuminated district marker along the waterfront edge.
    boxes.add(district.x, .18, district.z + size / 2 - .09, size * .36, .12, .08, '#394f49')
    boxes.add(district.x, .25, district.z + size / 2 - .05, size * .28, .035, .055, '#c9b48a')
    const label = document.createElement('span')
    label.className = 'city-district-label'
    label.style.cssText = 'position:absolute;left:0;top:0;padding:6px 9px 5px 14px;border:1px solid #8f8064;border-radius:1px;background:#efe6cf;color:#1c1a17;font:600 11px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.025em;text-transform:uppercase;white-space:nowrap;box-shadow:2px 2px 0 rgba(28,26,23,.45);transform:translate(-1000px,-1000px);transition:opacity .25s;'
    const pin = document.createElement('i')
    pin.style.cssText = 'position:absolute;left:5px;top:6px;width:4px;height:4px;border-radius:50%;background:#c8391f;box-shadow:1px 1px 0 rgba(28,26,23,.3);'
    const title = document.createElement('span')
    title.textContent = district.label || district.name
    label.append(pin, title)
    labelLayer.appendChild(label)
    labels.push({ element: label, title, pin, angle: (random() > .5 ? 1 : -1) * (1 + random()), district, point: new THREE.Vector3(district.x, .2, district.z + size / 2 + .45) })
  }

  const connectors = []
  function connectStreet(x1, z1, x2, z2) {
    const length = Math.hypot(x2 - x1, z2 - z1)
    if (length < .1) return
    const angle = -Math.atan2(z2 - z1, x2 - x1)
    boxes.add((x1 + x2) / 2, .05, (z1 + z2) / 2, length + .1, .2, 1.12, '#c4b38e', null, angle)
    boxes.add((x1 + x2) / 2, .157, (z1 + z2) / 2, length + .1, .025, .65, COLORS.road, null, angle)
    for (let offset = .4; offset < length; offset += .85) {
      const mix = offset / length
      boxes.add(THREE.MathUtils.lerp(x1, x2, mix), .175, THREE.MathUtils.lerp(z1, z2, mix), .25, .012, .03, '#efe6cf', null, angle)
    }
    connectors.push({ x1, z1, x2, z2 })
  }
  // A minimum-length street network joins islands of different sizes, rather
  // than painting roads through file lots when repository topology changes.
  const connected = new Set(districts.length ? [districts[0].id] : [])
  while (connected.size < districts.length) {
    let nearest = null
    for (const from of districts.filter(district => connected.has(district.id))) {
      for (const to of districts.filter(district => !connected.has(district.id))) {
        const distance = Math.hypot(to.x - from.x, to.z - from.z)
        if (!nearest || distance < nearest.distance) nearest = { from, to, distance }
      }
    }
    if (!nearest) break
    const { from, to } = nearest
    const dx = to.x - from.x
    const dz = to.z - from.z
    if (Math.abs(dx) > Math.abs(dz)) {
      const sign = Math.sign(dx)
      const startX = from.x + sign * (from.size / 2 - .48)
      const endX = to.x - sign * (to.size / 2 - .48)
      const midpoint = (startX + endX) / 2
      connectStreet(startX, from.z, midpoint, from.z)
      connectStreet(midpoint, from.z, midpoint, to.z)
      connectStreet(midpoint, to.z, endX, to.z)
    } else {
      const sign = Math.sign(dz)
      const startZ = from.z + sign * (from.size / 2 - .48)
      const endZ = to.z - sign * (to.size / 2 - .48)
      const midpoint = (startZ + endZ) / 2
      connectStreet(from.x, startZ, from.x, midpoint)
      connectStreet(from.x, midpoint, to.x, midpoint)
      connectStreet(to.x, midpoint, to.x, endZ)
    }
    connected.add(to.id)
  }
  const landscapeRandom = randomFor('citybase-waterfront-gardens')
  const gardenCount = Math.min(140, Math.round(worldSize.x * worldSize.y / 12))
  for (let index = 0; index < gardenCount; index++) {
    const x = worldCenter.x + (landscapeRandom() - .5) * (worldSize.x - 2)
    const z = worldCenter.y + (landscapeRandom() - .5) * (worldSize.y - 2)
    if (districts.some(district => Math.abs(x - district.x) < district.size / 2 + .45 && Math.abs(z - district.z) < district.size / 2 + .45)) continue
    if (connectors.some(street => x > Math.min(street.x1, street.x2) - .8 && x < Math.max(street.x1, street.x2) + .8 && z > Math.min(street.z1, street.z2) - .8 && z < Math.max(street.z1, street.z2) + .8)) continue
    cylinders.add(x, -.015, z, .45, .09, .45, '#537253')
    tree(x, z, .8 + landscapeRandom() * .7, landscapeRandom)
  }

  for (const building of buildings) {
    const random = randomFor(building.path)
    const { x, z, width: w, depth: d, path } = building
    const isTest = /(?:^|\/)(?:__tests__|tests?|e2e)\/|\.(?:test|spec)\./i.test(path)
    const isConfig = /(?:config|package|lock)|\.(?:json|toml|ya?ml|env|ini)$/i.test(building.name)
    const isDocument = /\.(?:md|mdx|txt|rst)$/i.test(path)
    const kind = isTest ? 'test' : isConfig ? 'config' : isDocument ? 'house' : building.kind
    const h = isTest ? Math.min(1.4, Math.max(.65, building.height * .5)) : isConfig ? .65 + random() * .24 : Math.max(building.height, .45)
    visualHeights.set(path, h)
    const base = .14
    const palette = districtPalettes.get(building.districtId) || DISTRICT_PALETTES[0]
    const tint = new THREE.Color(palette.walls[Math.floor(random() * palette.walls.length)])
    tint.multiplyScalar(.86 + random() * .18)
    const wall = `#${tint.getHexString()}`
    const roofTone = isTest ? '#b7af96' : isDocument ? '#c9b48a' : palette.roofs[Math.floor(random() * palette.roofs.length)]
    boxes.add(x, base + .065, z, w + .16, .13, d + .16, '#566b60', path)
    boxes.add(x, base + h / 2, z, w, h, d, wall, path)
    const roofY = base + h
    boxes.add(x, roofY, z, w + .055, .105, d + .055, roofTone, path)

    if (kind === 'house') {
      roofs.add(x, roofY + .21, z, w + .14, .48, d + .13, roofTone, path)
      boxes.add(x + w * .22, roofY + .38, z - d * .23, .16, .4, .16, '#afad93', path)
    } else if (kind === 'tower') {
      const crownHeight = .28 + random() * .5
      boxes.add(x, roofY + crownHeight / 2, z, w * .64, crownHeight, d * .65, wall, path)
      boxes.add(x, roofY + crownHeight, z, w * .7, .085, d * .7, roofTone, path)
      if (random() > .5) {
        cylinders.add(x, roofY + crownHeight + .28, z, .025, .56, .025, '#bbc6b7', path)
        signals.add(x, roofY + crownHeight + .55, z, .045, .045, .045, '#ffd09a')
      }
      // Slim corner piers and intermediate cornices make the towers architectural.
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
        boxes.add(x + dx * (w / 2 - .04), base + h / 2, z + dz * (d / 2 - .04), .09, h, .09, '#d9d0b8', path)
      }
      for (let floor = 1.25; floor < h - .3; floor += 1.2) {
        boxes.add(x, base + floor, z, w + .035, .055, d + .035, '#a9b5a1', path)
      }
    } else if (kind === 'test') {
      boxes.add(x, roofY + .09, z, w * .88, .16, d * .88, '#e5dbc1', path)
      boxes.add(x - w * .2, roofY + .21, z, .12, .08, d * .58, '#7e7662', path)
      boxes.add(x + w * .2, roofY + .21, z, .12, .08, d * .58, '#7e7662', path)
    } else if (kind === 'config') {
      roofs.add(x, roofY + .11, z, w + .12, .25, d + .12, '#c7b28a', path)
      boxes.add(x, base + h - .14, z + d / 2 + .016, w * .5, .055, .04, '#57513f', path)
    } else {
      boxes.add(x - w * .17, roofY + .12, z, w * .35, .23, d * .5, '#8d9d8e', path)
      cylinders.add(x + w * .23, roofY + .11, z + d * .12, Math.min(w, d) * .13, .23, Math.min(w, d) * .13, '#bbc0a9', path)
    }

    const floors = Math.max(1, Math.floor((h - .18) / .42))
    const columnsX = Math.max(1, Math.floor(w / .31))
    const columnsZ = Math.max(1, Math.floor(d / .31))
    for (let floor = 0; floor < floors; floor++) {
      const y = base + .3 + floor * ((h - .28) / floors)
      for (const side of [-1, 1]) {
        for (let column = 0; column < columnsX; column++) {
          const windowX = x + (column - (columnsX - 1) / 2) * (w / (columnsX + .35))
          const lit = random() > .37
          const target = lit ? windows : boxes
          target.add(windowX, y, z + side * (d / 2 + .007), Math.min(.14, w * .2), .18, .018, lit ? (random() > .65 ? '#ffcb85' : '#ffdca0') : '#465e56', path)
        }
        for (let column = 0; column < columnsZ; column++) {
          const windowZ = z + (column - (columnsZ - 1) / 2) * (d / (columnsZ + .35))
          const lit = random() > .37
          const target = lit ? windows : boxes
          target.add(x + side * (w / 2 + .009), y, windowZ, .018, .18, Math.min(.14, d * .2), lit ? '#ffd291' : '#465e56', path)
        }
      }
    }
    boxes.add(x, base + .19, z + d / 2 + .02, Math.min(.23, w * .26), .38, .03, '#354e47', path)
    windows.add(x, base + .32, z + d / 2 + .045, Math.min(.16, w * .19), .17, .016, '#eddaa5', path)
  }

  // A ruler and a carpenter's pencil establish the scale of the tabletop.
  const dockZ = worldCenter.y + worldSize.y / 2
  const rulerLength = Math.max(10, worldSize.x * .43)
  const rulerX = worldCenter.x - worldSize.x * .17
  const rulerZ = dockZ + 2.05
  boxes.add(rulerX, -1.35, rulerZ, rulerLength, .12, .86, '#c9b48a')
  for (let tick = 0; tick < rulerLength * 4 - 1; tick++) {
    const length = tick % 4 === 0 ? .43 : tick % 2 === 0 ? .3 : .19
    boxes.add(rulerX - rulerLength / 2 + .3 + tick / 4, -1.283, rulerZ - .4 + length / 2, .025, .015, length, '#1c1a17')
  }
  const pencil = new THREE.Group()
  function pencilPart(geometry, tint, y) {
    const part = new THREE.Mesh(own(geometry), own(new THREE.MeshStandardMaterial({ color: tint, roughness: .9 })))
    part.position.y = y
    part.castShadow = true
    pencil.add(part)
    return part
  }
  pencilPart(new THREE.CylinderGeometry(.13, .13, 5, 6), '#c8391f', 0)
  pencilPart(new THREE.ConeGeometry(.13, .5, 6), '#c9b48a', -2.75).rotation.z = Math.PI
  pencilPart(new THREE.ConeGeometry(.047, .18, 6), '#1c1a17', -3.04).rotation.z = Math.PI
  pencilPart(new THREE.CylinderGeometry(.135, .135, .2, 6), '#b6aa8c', 2.45)
  pencilPart(new THREE.CylinderGeometry(.13, .13, .28, 6), '#efe6cf', 2.68)
  pencil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, -.22).normalize())
  pencil.position.set(worldCenter.x + worldSize.x * .25, -1.25, dockZ + 2.3)
  scene.add(pencil)

  const paperCanvas = document.createElement('canvas')
  paperCanvas.width = 512
  paperCanvas.height = 256
  const paperInk = paperCanvas.getContext('2d')
  paperInk.fillStyle = '#efe6cf'
  paperInk.fillRect(0, 0, 512, 256)
  paperInk.strokeStyle = '#1c1a17'
  paperInk.lineWidth = 3
  paperInk.strokeRect(18, 18, 476, 220)
  paperInk.fillStyle = '#1c1a17'
  paperInk.font = 'bold 43px monospace'
  paperInk.fillText('CITYBASE', 40, 82)
  paperInk.font = '22px monospace'
  paperInk.fillText('A WORKING MODEL', 40, 124)
  paperInk.fillText('HANDLE WITH CURIOSITY', 40, 197)
  paperInk.fillStyle = '#c8391f'
  paperInk.fillRect(40, 145, 135, 7)
  const paperTexture = own(new THREE.CanvasTexture(paperCanvas))
  paperTexture.colorSpace = THREE.SRGBColorSpace
  const paper = new THREE.Mesh(own(new THREE.PlaneGeometry(5.3, 2.65)), own(new THREE.MeshStandardMaterial({ map: paperTexture, roughness: 1 })))
  paper.rotation.set(-Math.PI / 2, 0, -.14)
  paper.position.set(worldCenter.x - worldSize.x * .35, -1.415, dockZ + 4)
  paper.receiveShadow = true
  scene.add(paper)

  for (const item of pools) item.build()

  // One simple pick volume per file avoids raycasting thousands of window panes.
  const hitboxes = new THREE.InstancedMesh(boxGeometry, own(new THREE.MeshBasicMaterial({ visible: false })), buildings.length)
  hitboxes.userData.entries = buildings
  buildings.forEach((building, index) => {
    transform.position.set(building.x, .14 + (heightOf(building) + .4) / 2, building.z)
    transform.scale.set(building.width + .08, heightOf(building) + .4, building.depth + .08)
    transform.rotation.set(0, 0, 0)
    transform.updateMatrix()
    hitboxes.setMatrixAt(index, transform.matrix)
  })
  hitboxes.instanceMatrix.needsUpdate = true
  scene.add(hitboxes)
  interactiveMeshes.push(hitboxes)

  const statusLights = new THREE.InstancedMesh(boxGeometry, signalMaterial, buildings.length)
  scene.add(statusLights)
  function setStatus(files) {
    const statuses = new Map((files || []).map(file => [file.path, file]))
    buildings.forEach((building, index) => {
      const status = statuses.get(building.path)
      const visible = status && (status.dirty || status.staged || status.unstaged || !['clean', 'unchanged'].includes(status.status))
      transform.position.set(building.x, heightOf(building) + .34, building.z + building.depth / 2 + .01)
      transform.rotation.set(0, 0, 0)
      transform.scale.set(visible ? building.width * .76 : 0, .065, .085)
      transform.updateMatrix()
      statusLights.setMatrixAt(index, transform.matrix)
      statusLights.setColorAt(index, color.set(status?.staged ? COLORS.mint : COLORS.amber))
    })
    statusLights.instanceMatrix.needsUpdate = true
    if (statusLights.instanceColor) statusLights.instanceColor.needsUpdate = true
  }
  setStatus(buildings)

  const trafficCount = roads.length * 3
  const traffic = new THREE.InstancedMesh(boxGeometry, architectureMaterial, trafficCount)
  const headlights = new THREE.InstancedMesh(boxGeometry, signalMaterial, trafficCount)
  const trafficColors = ['#d3b583', '#abc4b0', '#668880', '#c09b85']
  for (let index = 0; index < trafficCount; index++) {
    traffic.setColorAt(index, color.set(trafficColors[index % trafficColors.length]))
    headlights.setColorAt(index, color.set('#f6dfab'))
  }
  traffic.castShadow = true
  scene.add(traffic, headlights)

  const selection = new THREE.Group()
  const selectionMaterial = own(new THREE.MeshBasicMaterial({ color: '#f2b544', transparent: true, opacity: .95, toneMapped: false }))
  for (let index = 0; index < 8; index++) selection.add(new THREE.Mesh(boxGeometry, selectionMaterial))
  const selectionBeam = new THREE.Mesh(
    own(new THREE.CylinderGeometry(.05, .14, 1, 16, 1, true)),
    own(new THREE.MeshBasicMaterial({ color: '#f2b544', transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide })),
  )
  selection.add(selectionBeam)
  selection.visible = false
  scene.add(selection)

  const hover = new THREE.Mesh(
    own(new THREE.RingGeometry(.4, .45, 32)),
    own(new THREE.MeshBasicMaterial({ color: '#e5dfbc', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false })),
  )
  hover.rotation.x = -Math.PI / 2
  hover.visible = false
  scene.add(hover)

  const drone = new THREE.Group()
  const droneBody = new THREE.Mesh(own(new THREE.SphereGeometry(.17, 10, 8)), own(new THREE.MeshStandardMaterial({ color: '#cedeca', metalness: .35, roughness: .45 })))
  droneBody.scale.set(1.4, .6, 1)
  drone.add(droneBody)
  const droneLight = new THREE.Mesh(own(new THREE.SphereGeometry(.065, 8, 6)), signalMaterial)
  droneLight.position.z = .13
  drone.add(droneLight)
  const rotors = []
  for (const x of [-.28, .28]) for (const z of [-.21, .21]) {
    const rotor = new THREE.Mesh(boxGeometry, architectureMaterial)
    rotor.position.set(x, .06, z)
    rotor.scale.set(.35, .025, .04)
    drone.add(rotor)
    rotors.push(rotor)
    const arm = new THREE.Mesh(boxGeometry, architectureMaterial)
    arm.scale.set(.32, .035, .045)
    arm.position.set(x / 2, 0, z / 2)
    arm.rotation.y = -Math.atan2(z, x)
    drone.add(arm)
  }
  drone.visible = false
  scene.add(drone)
  const scan = new THREE.Mesh(
    own(new THREE.RingGeometry(.94, 1, 64)),
    own(new THREE.MeshBasicMaterial({ color: '#f2b544', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })),
  )
  scan.rotation.x = -Math.PI / 2
  scan.visible = false
  scene.add(scan)

  // Pip is the player's explorer. Its motion is independent of the real agent
  // drone above, so discovering a neighborhood never implies an agent ran.
  const scout = new THREE.Group()
  const scoutCream = own(new THREE.MeshStandardMaterial({ color: '#eadbb6', roughness: .65 }))
  const scoutOrange = own(new THREE.MeshStandardMaterial({ color: '#c8391f', roughness: .9 }))
  const scoutDark = own(new THREE.MeshStandardMaterial({ color: '#253f3d', roughness: .6 }))
  const scoutGlow = own(new THREE.MeshBasicMaterial({ color: '#c9f0c6', toneMapped: false }))
  const scoutSphere = own(new THREE.SphereGeometry(1, 12, 8))
  function scoutPart(geometry, material, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.scale.set(sx, sy, sz)
    mesh.castShadow = true
    scout.add(mesh)
    return mesh
  }
  scoutPart(scoutSphere, scoutCream, 0, .46, 0, .23, .29, .18)
  scoutPart(scoutSphere, scoutCream, 0, .81, .015, .29, .22, .22)
  scoutPart(own(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), scoutOrange, 0, .89, .012, .305, .16, .24)
  scoutPart(boxGeometry, scoutOrange, 0, .9, .19, .37, .045, .19)
  scoutPart(scoutSphere, scoutDark, 0, .81, .182, .23, .115, .07)
  scoutPart(scoutSphere, scoutGlow, -.085, .825, .243, .025, .034, .02)
  scoutPart(scoutSphere, scoutGlow, .085, .825, .243, .025, .034, .02)
  scoutPart(boxGeometry, scoutOrange, 0, .49, -.2, .33, .36, .16)
  scoutPart(boxGeometry, scoutDark, 0, .49, -.287, .21, .06, .014)
  scoutPart(cylinderGeometry, scoutCream, .1, 1.065, 0, .02, .2, .02)
  const antenna = scoutPart(scoutSphere, scoutGlow, .1, 1.19, 0, .045, .045, .045)
  const scoutLimbs = [
    scoutPart(scoutSphere, scoutDark, -.105, .15, .01, .085, .16, .09),
    scoutPart(scoutSphere, scoutDark, .105, .15, .01, .085, .16, .09),
    scoutPart(scoutSphere, scoutCream, -.285, .45, .02, .075, .2, .08),
    scoutPart(scoutSphere, scoutCream, .285, .45, .02, .075, .2, .08),
  ]
  scout.scale.setScalar(1.15)
  const scoutStart = districts.flatMap(district => [
    { x: district.x, z: district.z + district.size / 2 - .48 },
    { x: district.x, z: district.z - district.size / 2 + .48 },
    { x: district.x + district.size / 2 - .48, z: district.z },
    { x: district.x - district.size / 2 + .48, z: district.z },
  ]).sort((a, b) => Math.hypot(a.x - worldCenter.x, a.z - worldCenter.y) - Math.hypot(b.x - worldCenter.x, b.z - worldCenter.y))[0]
  scout.position.set(scoutStart?.x ?? worldCenter.x, .21, scoutStart?.z ?? worldCenter.y)
  scene.add(scout)
  const scoutShadow = new THREE.Mesh(
    own(new THREE.CircleGeometry(.45, 24)),
    own(new THREE.MeshBasicMaterial({ color: '#193a34', transparent: true, opacity: .23, depthWrite: false })),
  )
  scoutShadow.rotation.x = -Math.PI / 2
  scene.add(scoutShadow)
  const scoutTrail = new THREE.InstancedMesh(leafGeometry, own(new THREE.MeshBasicMaterial({ color: '#d7bd8b', transparent: true, opacity: .34, depthWrite: false })), 7)
  scene.add(scoutTrail)
  const trailPoints = Array.from({ length: 7 }, () => scout.position.clone())
  const scoutLabel = document.createElement('span')
  scoutLabel.className = 'city-scout-label'
  scoutLabel.textContent = 'PIP'
  scoutLabel.style.cssText = 'position:absolute;left:0;top:0;padding:2px 5px;background:#c8391f;color:#efe6cf;font:700 10px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em;pointer-events:none;'
  labelLayer.appendChild(scoutLabel)
  let scoutEnabled = false
  let scoutDestination = null
  let scoutHasMoved = false
  let scoutVisitTarget = null
  let hopStarted = -100
  let preserveRestoredView = false
  const visitedDistricts = new Set()
  const pressedKeys = new Set()
  const movementDirection = new THREE.Vector3()
  const cameraForward = new THREE.Vector3()
  const cameraRight = new THREE.Vector3()
  function setScout(value) {
    const wasEnabled = scoutEnabled
    scoutEnabled = Boolean(value)
    pressedKeys.clear()
    controls.autoRotate = orbitRequested && !reducedMotion && !scoutEnabled
    if (!scoutEnabled) scoutDestination = null
    if (scoutEnabled && !wasEnabled && !preserveRestoredView) {
      const target = new THREE.Vector3(scout.position.x, .8, scout.position.z)
      const position = camera.position.clone().add(target.clone().sub(controls.target))
      const toZoom = Math.min(3, Math.max(2.1, extent / 24))
      if (reducedMotion) {
        controls.target.copy(target)
        camera.position.copy(position)
        camera.zoom = toZoom
        camera.updateProjectionMatrix()
      } else cameraTween = { start: elapsed, fromTarget: controls.target.clone(), toTarget: target, fromPosition: camera.position.clone(), toPosition: position, fromZoom: camera.zoom, toZoom }
    }
    preserveRestoredView = false
  }
  function travelTo(pathOrDistrictId) {
    const building = fileMap.get(pathOrDistrictId)
    const district = districtMap.get(pathOrDistrictId)
    if (!building && !district) return
    scoutDestination = building
      ? new THREE.Vector3(building.x, .2, building.z + building.depth / 2 + .65)
      : new THREE.Vector3(district.x, .2, district.z + district.size / 2 - .5)
    scoutVisitTarget = building?.districtId || district.id
    scoutHasMoved = true
  }
  function setVisited(ids) {
    for (const id of ids || []) visitedDistricts.add(id)
    for (const label of labels) {
      label.title.textContent = `${visitedDistricts.has(label.district.id) ? '✓ ' : ''}${label.district.label || label.district.name}`
      label.pin.style.background = visitedDistricts.has(label.district.id) ? '#6f8f4c' : '#c8391f'
    }
  }
  function handleKeyDown(event) {
    if (!scoutEnabled || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return
    if (event.code === 'Space' && !/BUTTON|A/.test(event.target.tagName)) {
      event.preventDefault()
      if (!event.repeat) hopStarted = elapsed
      return
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      pressedKeys.add(event.key.toLowerCase())
      scoutDestination = null
      cameraTween = null
      scoutHasMoved = true
    }
  }
  function handleKeyUp(event) { pressedKeys.delete(event.key.toLowerCase()) }
  function clearKeys() { pressedKeys.clear() }
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', clearKeys)

  let selectedPath = null
  let activeDistrict = null
  let activityPaths = []
  let isRunning = false
  let completionAt = -100
  let elapsed = 0
  let currentHover = null
  let pointerDown = null
  let destroyed = false
  let cameraTween = null
  let width = 1
  let height = 1
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const projection = new THREE.Vector3()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.15)
  const groundPoint = new THREE.Vector3()
  const stopCameraTween = () => { cameraTween = null }
  controls.addEventListener('start', stopCameraTween)

  function fit(immediate = false) {
    const aspect = width / height
    const span = Math.max(worldSize.x * .82, worldSize.y * .82, 13)
    const halfHeight = Math.max(span * .61, span * .73 / aspect)
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    const target = new THREE.Vector3(worldCenter.x, .7, worldCenter.y)
    const position = target.clone().add(new THREE.Vector3(extent * .83, extent * .91, extent * 1.13))
    if (immediate || reducedMotion) {
      camera.position.copy(position)
      controls.target.copy(target)
      camera.zoom = 1
      camera.updateProjectionMatrix()
      controls.update()
      cameraTween = null
    } else {
      cameraTween = { start: elapsed, fromTarget: controls.target.clone(), toTarget: target, fromPosition: camera.position.clone(), toPosition: position, fromZoom: camera.zoom, toZoom: 1 }
    }
  }

  function resize() {
    if (destroyed) return
    const previousAspect = width / height
    width = Math.max(container.clientWidth, 1)
    height = Math.max(container.clientHeight, 1)
    renderer.setSize(width, height, false)
    const newAspect = width / height
    camera.left *= newAspect / previousAspect
    camera.right *= newAspect / previousAspect
    camera.updateProjectionMatrix()
  }
  resize()
  fit(true)
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const intersections = raycaster.intersectObjects(interactiveMeshes, false)
    for (const hit of intersections) {
      const path = hit.object.userData.entries[hit.instanceId]?.path
      if (path) return path
    }
    return null
  }
  function handlePointerMove(event) {
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4) {
      pointerDown.dragged = true
      if (currentHover) onHover(null)
      currentHover = null
      hover.visible = false
      return
    }
    const path = pick(event)
    currentHover = path
    renderer.domElement.style.cursor = path ? 'pointer' : 'grab'
    const building = fileMap.get(path)
    hover.visible = Boolean(building && path !== selectedPath)
    if (building) {
      hover.position.set(building.x, .235, building.z)
      const radius = Math.max(building.width, building.depth) * .95
      hover.scale.set(radius, radius, 1)
    }
    onHover(path, { x: event.clientX, y: event.clientY })
  }
  function handlePointerDown(event) {
    cameraTween = null
    pointerDown = { x: event.clientX, y: event.clientY, dragged: false, button: event.button }
    renderer.domElement.style.cursor = 'grabbing'
  }
  function handlePointerUp(event) {
    if (pointerDown && !pointerDown.dragged && pointerDown.button === 0) {
      const path = pick(event)
      if (path) onSelect(path)
      else if (scoutEnabled && raycaster.ray.intersectPlane(groundPlane, groundPoint) && bounds.containsPoint(new THREE.Vector2(groundPoint.x, groundPoint.z))) {
        scoutDestination = groundPoint.clone()
        scoutVisitTarget = null
        scoutHasMoved = true
      }
    }
    pointerDown = null
    renderer.domElement.style.cursor = currentHover ? 'pointer' : 'grab'
  }
  function handlePointerLeave() {
    pointerDown = null
    currentHover = null
    hover.visible = false
    onHover(null)
  }
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointerup', handlePointerUp)
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
  renderer.domElement.addEventListener('pointercancel', handlePointerLeave)

  function setSelection(path) {
    selectedPath = path
    const building = fileMap.get(path)
    selection.visible = Boolean(building)
    if (!building) return
    const halfWidth = building.width / 2 + .18
    const halfDepth = building.depth / 2 + .18
    selection.position.set(building.x, .24, building.z)
    let index = 0
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const a = selection.children[index++]
      a.position.set(x * (halfWidth - .11), 0, z * halfDepth)
      a.scale.set(.3, .035, .045)
      const b = selection.children[index++]
      b.position.set(x * halfWidth, 0, z * (halfDepth - .11))
      b.scale.set(.045, .035, .3)
    }
    const beamHeight = Math.max(heightOf(building) + 2, 4)
    selectionBeam.position.set(0, beamHeight / 2, 0)
    selectionBeam.scale.set(1, beamHeight, 1)
  }

  function focus(pathOrDistrictId) {
    const building = fileMap.get(pathOrDistrictId)
    const district = districtMap.get(pathOrDistrictId)
    const item = building || district
    if (!item) return
    const target = new THREE.Vector3(item.x, building ? Math.min(heightOf(building) * .38, 2) : .5, item.z)
    const position = camera.position.clone().add(target.clone().sub(controls.target))
    const toZoom = building ? Math.min(3, Math.max(1.75, extent / 13)) : Math.min(2.4, Math.max(1.25, extent / (district.size * 1.55)))
    if (reducedMotion) {
      camera.position.copy(position)
      controls.target.copy(target)
      camera.zoom = toZoom
      camera.updateProjectionMatrix()
    } else cameraTween = { start: elapsed, fromTarget: controls.target.clone(), toTarget: target, fromPosition: camera.position.clone(), toPosition: position, fromZoom: camera.zoom, toZoom }
  }

  function setDistrict(id) {
    activeDistrict = id
    for (const slab of districtMeshes) {
      slab.material.color.set(!id || slab.userData.districtId === id ? '#ded1ad' : '#b5a88b')
    }
    for (const label of labels) label.element.style.opacity = !id || label.district.id === id ? '1' : '.4'
  }

  function setActivity(paths, running) {
    activityPaths = (paths || []).filter(path => fileMap.has(path))
    if (isRunning && !running) completionAt = elapsed
    isRunning = Boolean(running)
    drone.visible = isRunning
    scan.visible = isRunning || elapsed - completionAt < 1.8
    if (isRunning && !activityPaths.length) {
      // A waiting agent stays by the ruler; it does not claim to modify a file.
      drone.position.set(worldCenter.x, 3, dockZ + .5)
    }
  }

  function setTime(time) {
    const day = time === 'day'
    ambient.intensity = day ? 1.6 : .85
    sunlight.intensity = day ? 3.6 : 3.1
    sunlight.color.set(day ? '#fff0d2' : '#ffd599')
    fillLight.intensity = day ? .65 : .36
    deskLamp.intensity = extent * extent * (day ? .7 : 1.8)
    windowMaterial.color.set(day ? '#b6b59a' : '#fff0d1')
    lampPoolMaterial.opacity = day ? .02 : .07
    renderer.toneMappingExposure = day ? 1.27 : 1.16
    scene.background.set(COLORS.sea)
  }

  function animateTraffic(time) {
    for (let index = 0; index < trafficCount; index++) {
      const road = roads[Math.floor(index / 3)]
      const distance = ((time * .035 + road.phase + index / 3) % 1) * 8 * road.edge
      const side = Math.floor(distance / (2 * road.edge))
      const offset = distance % (2 * road.edge) - road.edge
      const positions = [[offset, -road.edge], [road.edge, offset], [-offset, road.edge], [-road.edge, -offset]]
      const [x, z] = positions[side]
      const angle = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][side]
      transform.position.set(road.x + x, .23, road.z + z)
      transform.rotation.set(0, angle, 0)
      transform.scale.set(.13, .11, .26)
      transform.updateMatrix()
      traffic.setMatrixAt(index, transform.matrix)
      transform.position.x -= Math.sin(angle) * .14
      transform.position.z -= Math.cos(angle) * .14
      transform.scale.set(.115, .035, .035)
      transform.updateMatrix()
      headlights.setMatrixAt(index, transform.matrix)
    }
    traffic.instanceMatrix.needsUpdate = true
    headlights.instanceMatrix.needsUpdate = true
  }

  let frame = 0
  let previousTime = performance.now()
  let ready = false
  function animateScout(delta, visualTime) {
    movementDirection.set(0, 0, 0)
    if (scoutDestination) {
      movementDirection.subVectors(scoutDestination, scout.position)
      movementDirection.y = 0
      const distance = movementDirection.length()
      if (distance < .2) {
        scoutDestination = null
        if (scoutVisitTarget && !visitedDistricts.has(scoutVisitTarget)) {
          visitedDistricts.add(scoutVisitTarget)
          setVisited(visitedDistricts)
          onVisitDistrict(scoutVisitTarget)
        }
      } else movementDirection.normalize().multiplyScalar(Math.min(distance / delta, Math.max(3.5, extent * .11)))
    } else if (scoutEnabled && pressedKeys.size) {
      camera.getWorldDirection(cameraForward)
      cameraForward.y = 0
      cameraForward.normalize()
      cameraRight.crossVectors(cameraForward, camera.up).normalize()
      if (pressedKeys.has('w') || pressedKeys.has('arrowup')) movementDirection.add(cameraForward)
      if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) movementDirection.sub(cameraForward)
      if (pressedKeys.has('d') || pressedKeys.has('arrowright')) movementDirection.add(cameraRight)
      if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) movementDirection.sub(cameraRight)
      movementDirection.normalize().multiplyScalar(4.4)
    }
    const moving = movementDirection.lengthSq() > .01
    scout.position.addScaledVector(movementDirection, delta)
    scout.position.x = THREE.MathUtils.clamp(scout.position.x, bounds.min.x, bounds.max.x)
    scout.position.z = THREE.MathUtils.clamp(scout.position.z, bounds.min.y, bounds.max.y)
    let surface = .2
    for (const building of buildings) {
      if (Math.abs(scout.position.x - building.x) < building.width / 2 + .45 && Math.abs(scout.position.z - building.z) < building.depth / 2 + .45) surface = Math.max(surface, heightOf(building) + .8)
    }
    const hopProgress = (elapsed - hopStarted) / .65
    const hop = !reducedMotion && hopProgress < 1 ? Math.sin(hopProgress * Math.PI) * .8 : 0
    scout.position.y = THREE.MathUtils.lerp(scout.position.y, surface + hop + (moving && !reducedMotion ? Math.abs(Math.sin(visualTime * 11)) * .1 : 0), Math.min(1, delta * 12))
    if (moving) {
      const angle = Math.atan2(movementDirection.x, movementDirection.z)
      const difference = Math.atan2(Math.sin(angle - scout.rotation.y), Math.cos(angle - scout.rotation.y))
      scout.rotation.y += difference * Math.min(1, delta * 10)
    }
    scoutLimbs.forEach((limb, index) => {
      limb.rotation.x = moving && !reducedMotion ? Math.sin(visualTime * 11 + index % 2 * Math.PI) * .48 : 0
    })
    antenna.material.color.set(scoutEnabled || moving ? '#c9f0c6' : '#e0bd81')
    scoutShadow.position.set(scout.position.x, .165, scout.position.z)
    const shadowScale = 1 + (scout.position.y - .2) * .13
    scoutShadow.scale.setScalar(shadowScale)
    scoutShadow.material.opacity = .23 / shadowScale
    trailPoints[0].lerp(scout.position, Math.min(1, delta * 12))
    trailPoints.forEach((point, index) => {
      if (index) point.lerp(trailPoints[index - 1], Math.min(1, delta * 12))
      transform.position.copy(point)
      transform.position.y += .15
      transform.rotation.set(0, 0, 0)
      transform.scale.setScalar(moving && !reducedMotion ? .07 * (1 - index / 7) : 0)
      transform.updateMatrix()
      scoutTrail.setMatrixAt(index, transform.matrix)
    })
    scoutTrail.instanceMatrix.needsUpdate = true
    if (scoutEnabled && moving && !cameraTween) {
      const target = new THREE.Vector3(scout.position.x, .7, scout.position.z)
      const shift = target.sub(controls.target).multiplyScalar(1 - Math.exp(-delta * 2))
      controls.target.add(shift)
      camera.position.add(shift)
    }
    if (scoutEnabled && scoutHasMoved) {
      for (const district of districts) {
        if (!visitedDistricts.has(district.id) && Math.abs(scout.position.x - district.x) < district.size / 2 && Math.abs(scout.position.z - district.z) < district.size / 2) {
          visitedDistricts.add(district.id)
          setVisited(visitedDistricts)
          onVisitDistrict(district.id)
        }
      }
    }
    projection.copy(scout.position).add(new THREE.Vector3(0, 1.7, 0)).project(camera)
    scoutLabel.style.transform = `translate(${((projection.x * .5 + .5) * width).toFixed(1)}px,${((-projection.y * .5 + .5) * height).toFixed(1)}px) translate(-50%,-50%)`
    scoutLabel.style.opacity = scoutEnabled || moving ? '1' : '.65'
  }
  function animate(now) {
    if (destroyed) return
    frame = requestAnimationFrame(animate)
    const delta = Math.min((now - previousTime) / 1000, .06)
    previousTime = now
    elapsed += delta
    const visualTime = reducedMotion ? 0 : elapsed
    if (cameraTween) {
      const progress = Math.min(1, (elapsed - cameraTween.start) / .85)
      const eased = 1 - (1 - progress) ** 3
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased)
      camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased)
      camera.zoom = THREE.MathUtils.lerp(cameraTween.fromZoom, cameraTween.toZoom, eased)
      camera.updateProjectionMatrix()
      if (progress === 1) cameraTween = null
    }
    controls.update(delta)
    animateScout(delta, visualTime)
    animateTraffic(visualTime)
    selectionMaterial.opacity = reducedMotion ? 1 : .76 + Math.sin(elapsed * 2) * .16
    if (isRunning) {
      const target = fileMap.get(activityPaths[Math.floor(elapsed / 5) % Math.max(activityPaths.length, 1)])
      const targetPosition = target
        ? new THREE.Vector3(target.x + .5, heightOf(target) + 1.45, target.z + .45)
        : new THREE.Vector3(worldCenter.x, 3, dockZ + .5)
      if (reducedMotion) drone.position.copy(targetPosition)
      else drone.position.lerp(targetPosition, 1 - Math.exp(-delta * 2.5))
      drone.position.y += reducedMotion ? 0 : Math.sin(elapsed * 2.3) * .003
      rotors.forEach((rotor, index) => { rotor.rotation.y = visualTime * (index % 2 ? 18 : -18) })
      scan.visible = Boolean(target)
      if (target) {
        scan.position.set(target.x, .26, target.z)
        const radius = Math.max(target.width, target.depth) * (.85 + (visualTime % 2) * .38)
        scan.scale.set(radius, radius, 1)
        scan.material.opacity = reducedMotion ? .75 : .75 * (1 - visualTime % 2 / 2)
      }
    } else if (elapsed - completionAt < 1.8) {
      const progress = (elapsed - completionAt) / 1.8
      scan.scale.setScalar(1 + progress * 3)
      scan.material.opacity = (1 - progress) * .7
    } else scan.visible = false

    for (const label of labels) {
      projection.copy(label.point).project(camera)
      const x = (projection.x * .5 + .5) * width
      const y = (-projection.y * .5 + .5) * height
      const visible = projection.z < 1 && x > -50 && x < width + 50 && y > 0 && y < height - 20
      label.element.style.display = visible ? 'block' : 'none'
      label.element.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,0) rotate(${label.angle.toFixed(2)}deg)`
      if (activeDistrict) label.element.style.opacity = label.district.id === activeDistrict ? '1' : '.35'
    }
    renderer.render(scene, camera)
    if (!ready) {
      ready = true
      onReady({ renderer: 'WebGL', buildings: buildings.length, drawCalls: renderer.info.render.calls })
    }
  }
  frame = requestAnimationFrame(animate)
  function onContextLost(event) {
    event.preventDefault()
    onError(new Error('The graphics context was interrupted. Reload the city to reconnect.'))
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost)

  return {
    setSelection, setActivity, setDistrict, setTime, focus, setScout, travelTo, setStatus, setVisited,
    captureView() {
      return { position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom, frustumHeight: camera.top - camera.bottom, scoutPosition: scout.position.toArray() }
    },
    restoreView(view) {
      if (!view || ![view.position, view.target].every(value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) || !Number.isFinite(view.zoom)) return
      cameraTween = null
      camera.position.fromArray(view.position)
      controls.target.fromArray(view.target)
      camera.zoom = THREE.MathUtils.clamp(view.zoom, controls.minZoom, controls.maxZoom)
      if (Number.isFinite(view.frustumHeight) && view.frustumHeight > 0) {
        camera.top = view.frustumHeight / 2
        camera.bottom = -camera.top
        camera.right = camera.top * width / height
        camera.left = -camera.right
      }
      if (Array.isArray(view.scoutPosition) && view.scoutPosition.length === 3 && view.scoutPosition.every(Number.isFinite)) scout.position.fromArray(view.scoutPosition)
      preserveRestoredView = true
      camera.updateProjectionMatrix()
      controls.update()
    },
    fit: () => fit(false),
    zoom(factor) {
      cameraTween = null
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom)
      camera.updateProjectionMatrix()
    },
    setOrbit(value) {
      orbitRequested = Boolean(value)
      controls.autoRotate = orbitRequested && !reducedMotion && !scoutEnabled
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      motionQuery.removeEventListener('change', onMotionChange)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', clearKeys)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('pointercancel', handlePointerLeave)
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      controls.dispose()
      controls.removeEventListener('start', stopCameraTween)
      scene.traverse(object => { if (object.isInstancedMesh) object.dispose() })
      for (const resource of resources) resource.dispose()
      sunlight.shadow.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      labelLayer.remove()
    },
  }
}
