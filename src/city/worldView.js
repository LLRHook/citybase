// Keep the same view relative to the place the player is inspecting, even when
// a new file changes the district grid. A free camera retains absolute position.
export function reconcileWorldView(view, before, after, { selected, district } = {}) {
  if (!view || !before || !after) return view;
  let oldAnchor = selected && before.buildings.find(building => building.path === selected);
  let newAnchor = selected && after.buildings.find(building => building.path === selected);
  if (!oldAnchor || !newAnchor) {
    oldAnchor = district && before.districts.find(place => place.id === district);
    newAnchor = district && after.districts.find(place => place.id === district);
  }
  if (!oldAnchor || !newAnchor) return view;
  const dx = newAnchor.x - oldAnchor.x;
  const dz = newAnchor.z - oldAnchor.z;
  if (!dx && !dz) return view;
  const translate = point => Array.isArray(point) ? [point[0] + dx, point[1], point[2] + dz] : point;
  return { ...view, position: translate(view.position), target: translate(view.target), scoutPosition: translate(view.scoutPosition) };
}
