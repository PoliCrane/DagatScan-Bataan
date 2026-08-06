/**
 * Coastline utility functions for extracting and processing the outer boundary
 * from GeoJSON municipality data using turf.js
 */

import * as turf from "@turf/turf";

/**
 * Extracts a municipality's coastline via topological edge hashing: edges shared with
 * a neighboring municipality's polygon are internal boundaries, unshared edges are coastline.
 */
export const extractCoastline = (geoJsonData, selectedMunicipality) => {
  // Validate inputs
  if (!selectedMunicipality || typeof selectedMunicipality !== "string") {
    console.warn(`Invalid municipality name: ${selectedMunicipality}`);
    return [];
  }

  if (!geoJsonData || !geoJsonData.features || geoJsonData.features.length === 0) {
    console.warn("Invalid or empty GeoJSON data");
    return [];
  }

  try {
    // Get all polygon features
    const allPolygons = geoJsonData.features.filter(
      (feature) => feature.geometry && feature.geometry.type === "Polygon"
    );

    if (allPolygons.length === 0) {
      console.warn("No Polygon features found");
      return [];
    }

    // Find the selected municipality features
    const selectedFeatures = allPolygons.filter(
      (feature) => feature.properties?.MUNICIPALI?.toUpperCase() === selectedMunicipality?.toUpperCase()
    );

    if (selectedFeatures.length === 0) {
      console.warn(`Municipality ${selectedMunicipality} not found`);
      return [];
    }

    // If multiple features for same municipality (like Mariveles), use the largest
    let mainFeature = selectedFeatures[0];
    if (selectedFeatures.length > 1) {
      const areas = selectedFeatures.map((f) => {
        const bbox = turf.bbox(f);
        return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
      });
      const maxIdx = areas.indexOf(Math.max(...areas));
      mainFeature = selectedFeatures[maxIdx];
    }

    console.log(`🔍 Topological edge detection: building edge map from ${allPolygons.length} municipalities...`);

    // Build a map of all edges from all municipalities
    // Key: normalized edge hash, Value: { count, edgeObj, municipality }
    const edgeMap = buildEdgeMap(allPolygons);

    console.log(`  Total unique edges: ${edgeMap.size}`);

    // Extract only unshared edges (count === 1) belonging to the selected municipality
    const coastlineEdges = extractUnsharedEdgesFromMap(mainFeature, selectedMunicipality, edgeMap);

    if (coastlineEdges.length === 0) {
      console.warn(`No unshared edges found for ${selectedMunicipality}`);
      return [];
    }

    // Merge edges into a continuous coastline polyline
    const coastline = mergeEdgesToPolyline(coastlineEdges);

    if (coastline.length === 0) {
      console.warn("Failed to merge coastline edges");
      return [];
    }

    console.log(`✓ Extracted ${coastline.length} coastline points for ${selectedMunicipality}`);
    return coastline;
  } catch (error) {
    console.error("Error extracting coastline (topological edge hashing):", error);
    return [];
  }
};

// Maps each edge (direction-independent hash) to how many municipalities' polygons contain it
const buildEdgeMap = (polygonFeatures) => {
  const edgeMap = new Map(); // key: edgeHash, value: { count, edges: [] }

  // Extract all edges from all municipalities
  polygonFeatures.forEach((feature) => {
    const municipalityName = feature.properties?.MUNICIPALI || "Unknown";
    const geometry = feature.geometry;

    if (geometry.type !== "Polygon") return;

    const outerRing = geometry.coordinates[0]; // Outer ring only, not holes
    if (!Array.isArray(outerRing) || outerRing.length < 2) return;

    // Create edges from consecutive vertices
    for (let i = 0; i < outerRing.length - 1; i++) {
      const [lng1, lat1] = outerRing[i];
      const [lng2, lat2] = outerRing[i + 1];

      // Create normalized edge hash (direction doesn't matter)
      const edgeHash = createNormalizedEdgeHash([lat1, lng1], [lat2, lng2]);

      // Track this edge
      if (!edgeMap.has(edgeHash)) {
        edgeMap.set(edgeHash, {
          count: 0,
          edges: [],
        });
      }

      const existing = edgeMap.get(edgeHash);
      existing.count += 1;
      existing.edges.push({
        start: [lat1, lng1],
        end: [lat2, lng2],
        municipality: municipalityName,
        originalIdx: i,
      });
    }
  });

  // Log edge statistics
  let shared = 0;
  let coastal = 0;
  edgeMap.forEach((value) => {
    if (value.count === 1) coastal++;
    if (value.count === 2) shared++;
  });

  console.log(`  Edge statistics: ${coastal} coastal (count=1), ${shared} shared (count=2), ${edgeMap.size - coastal - shared} other`);

  return edgeMap;
};

// Direction-independent hash so edge [A,B] matches [B,A]
const createNormalizedEdgeHash = (coord1, coord2) => {
  // Round to high precision to handle floating point variations
  const lat1 = coord1[0].toFixed(8);
  const lng1 = coord1[1].toFixed(8);
  const lat2 = coord2[0].toFixed(8);
  const lng2 = coord2[1].toFixed(8);

  // Create two possible orderings
  const forward = `${lat1},${lng1}|${lat2},${lng2}`;
  const backward = `${lat2},${lng2}|${lat1},${lng1}`;

  // Return the lexicographically smaller one (ensures consistency)
  return forward < backward ? forward : backward;
};

const extractUnsharedEdgesFromMap = (municipalityFeature, selectedMunicipality, edgeMap) => {
  const geometry = municipalityFeature.geometry;
  if (geometry.type !== "Polygon") return [];

  const outerRing = geometry.coordinates[0]; // Outer ring only
  if (!Array.isArray(outerRing) || outerRing.length < 2) return [];

  const unsharedEdges = [];
  const municipalityUpper = selectedMunicipality.toUpperCase();

  // Check each edge of this municipality
  for (let i = 0; i < outerRing.length - 1; i++) {
    const [lng1, lat1] = outerRing[i];
    const [lng2, lat2] = outerRing[i + 1];

    const edgeHash = createNormalizedEdgeHash([lat1, lng1], [lat2, lng2]);
    const edgeData = edgeMap.get(edgeHash);

    if (!edgeData) {
      console.warn(`  Warning: edge at index ${i} not found in edge map`);
      continue;
    }

    // Keep only edges that appear exactly once (coastline edges)
    // Edges appearing twice are shared internal boundaries
    if (edgeData.count === 1) {
      unsharedEdges.push({
        start: [lat1, lng1],
        end: [lat2, lng2],
        index: i,
        shared: false,
        hash: edgeHash,
      });
    } else {
      console.debug(`  Edge ${i} is shared (${edgeData.count} occurrences)`);
    }
  }

  console.log(`  Result: ${unsharedEdges.length}/${outerRing.length - 1} edges are unshared (coastal)`);
  return unsharedEdges;
};

// Merges edges into polyline(s) via adjacency-map DFS traversal; may return multiple segments if disconnected
const mergeEdgesToPolyline = (edges) => {
  if (edges.length === 0) return [];

  // Build an adjacency map where keys are coordinate hashes
  // Value: array of edge indices connected to this node
  const { adjMap, nodeInfo } = buildAdjacencyMap(edges);

  console.log(`  Building polyline from ${edges.length} edges using ${adjMap.size} nodes`);

  // Find all start nodes (degree 1 - only one connection)
  // Closed loops will have no start nodes (all degree 2)
  const startNodes = findStartNodes(adjMap);

  console.log(`  Found ${startNodes.length} start/end nodes (open polylines) or 0 (closed loops)`);

  const polylines = [];
  const visitedEdges = new Set();

  // Traverse from each start node
  for (const startNodeHash of startNodes) {
    const polyline = traversePolylineFromNode(
      startNodeHash,
      adjMap,
      edges,
      nodeInfo,
      visitedEdges
    );

    if (polyline.length > 2) {
      // Only keep polylines with at least 2 distinct points
      polylines.push(polyline);
      console.log(`  Polyline segment: ${polyline.length} points`);
    }
  }

  // If no start nodes found (closed loop), start from any unvisited edge
  if (polylines.length === 0 && edges.length > 0) {
    console.log(`  Detected closed loop, starting from first edge`);
    const firstEdgeStart = hashCoordinate(edges[0].start);
    const polyline = traversePolylineFromNode(
      firstEdgeStart,
      adjMap,
      edges,
      nodeInfo,
      visitedEdges
    );

    if (polyline.length > 2) {
      polylines.push(polyline);
      console.log(`  Closed loop polyline: ${polyline.length} points`);
    }
  }

  // Warn if not all edges were used
  if (visitedEdges.size < edges.length) {
    const unused = edges.length - visitedEdges.size;
    console.warn(
      `⚠️  ${unused}/${edges.length} edges were not connected to main polyline(s). ` +
      `This may indicate disconnected coastal segments.`
    );
  }

  // Return single polyline if only one, otherwise return array
  if (polylines.length === 1) {
    return polylines[0];
  }

  console.log(`✓ Generated ${polylines.length} polyline segments`);
  return polylines.length > 0 ? polylines : [];
};

// Rounds to 8 decimal places so floating-point variations still hash consistently
const hashCoordinate = (coord) => {
  return `${coord[0].toFixed(8)},${coord[1].toFixed(8)}`;
};

const buildAdjacencyMap = (edges) => {
  const adjMap = new Map(); // hash -> Set of edge indices
  const nodeInfo = new Map(); // hash -> { coord: [lat,lng], degree: number }

  // Build the graph
  edges.forEach((edge, idx) => {
    const startHash = hashCoordinate(edge.start);
    const endHash = hashCoordinate(edge.end);

    // Add edge to adjacency of start node
    if (!adjMap.has(startHash)) {
      adjMap.set(startHash, new Set());
      nodeInfo.set(startHash, { coord: edge.start, degree: 0 });
    }
    adjMap.get(startHash).add(idx);
    nodeInfo.get(startHash).degree += 1;

    // Add edge to adjacency of end node
    if (!adjMap.has(endHash)) {
      adjMap.set(endHash, new Set());
      nodeInfo.set(endHash, { coord: edge.end, degree: 0 });
    }
    adjMap.get(endHash).add(idx);
    nodeInfo.get(endHash).degree += 1;
  });

  return { adjMap, nodeInfo };
};

// Degree-1 nodes are open ends of polylines, the ideal traversal start points
const findStartNodes = (adjMap) => {
  const startNodes = [];

  adjMap.forEach((edges, nodeHash) => {
    // Degree is how many edges connect to this node
    // Degree 1 = end of an open polyline
    if (edges.size === 1) {
      startNodes.push(nodeHash);
    }
  });

  return startNodes;
};

// DFS from a start node into a continuous polyline; visited edges aren't reused
const traversePolylineFromNode = (
  startNodeHash,
  adjMap,
  edges,
  nodeInfo,
  visitedEdges
) => {
  const polyline = [];
  const stack = [startNodeHash]; // DFS stack
  const stackInfo = [null]; // Track which edge we used to reach each node
  let currentNode = startNodeHash;

  // Start the polyline with the first node
  const firstCoord = nodeInfo.get(startNodeHash)?.coord;
  if (firstCoord) {
    polyline.push([...firstCoord]);
  }

  // DFS traversal
  let iterations = 0;
  const maxIterations = edges.length * 3; // Safety limit

  while (stack.length > 0 && iterations < maxIterations) {
    iterations++;
    currentNode = stack[stack.length - 1];
    const connectedEdgeIndices = adjMap.get(currentNode);

    if (!connectedEdgeIndices || connectedEdgeIndices.size === 0) {
      stack.pop();
      stackInfo.pop();
      continue;
    }

    let foundNext = false;

    // Find an unvisited edge from current node
    for (const edgeIdx of connectedEdgeIndices) {
      if (visitedEdges.has(edgeIdx)) continue;

      foundNext = true;
      visitedEdges.add(edgeIdx);

      const edge = edges[edgeIdx];
      const currentHash = hashCoordinate(edge.start) === currentNode
        ? hashCoordinate(edge.end)
        : hashCoordinate(edge.start);

      const currentCoord = nodeInfo.get(currentHash)?.coord;
      if (!currentCoord) continue;

      // Add this coordinate to the polyline
      polyline.push([...currentCoord]);

      // Move to next node
      stack.push(currentHash);
      stackInfo.push(edgeIdx);
      break;
    }

    if (!foundNext) {
      // Dead end - backtrack
      stack.pop();
      stackInfo.pop();
    }
  }

  if (iterations >= maxIterations) {
    console.warn(`  DFS traversal hit iteration limit (possible cycle)`);
  }

  // Remove duplicate consecutive points
  const cleaned = [];
  for (let i = 0; i < polyline.length; i++) {
    if (
      cleaned.length === 0 ||
      !coordinatesClose(polyline[i], cleaned[cleaned.length - 1], 0.00000001)
    ) {
      cleaned.push(polyline[i]);
    }
  }

  return cleaned;
};

const coordinatesClose = (coord1, coord2, tolerance = 0.0001) => {
  return (
    Math.abs(coord1[0] - coord2[0]) < tolerance &&
    Math.abs(coord1[1] - coord2[1]) < tolerance
  );
};

// Arc-length-based segmentation keeps segments evenly sized regardless of point density; each can have its own erosion level
export const segmentCoastline = (coastlinePoints, segmentLength = 10) => {
  if (coastlinePoints.length < 2) return [];

  // IMPROVED: Use arc-length based segmentation for even distribution
  const segments = [];
  const segmentDistances = []; // Track cumulative distance for each point
  let cumulativeDistance = 0;

  // Calculate cumulative arc-length distance from start
  segmentDistances.push(0);
  for (let i = 1; i < coastlinePoints.length; i++) {
    const distance = calculateDistance(coastlinePoints[i - 1], coastlinePoints[i]);
    cumulativeDistance += distance;
    segmentDistances.push(cumulativeDistance);
  }

  const totalLength = cumulativeDistance;
  const targetSegmentCount = Math.max(50, Math.floor(coastlinePoints.length / segmentLength));
  const idealSegmentLength = totalLength / targetSegmentCount; // Arc-length per segment

  let currentSegment = [];
  let currentSegmentLength = 0;
  let lastSegmentDistance = 0;

  for (let i = 0; i < coastlinePoints.length; i++) {
    currentSegment.push(coastlinePoints[i]);
    const pointDistance = segmentDistances[i];
    currentSegmentLength = pointDistance - lastSegmentDistance;

    // Create segment when we've collected enough arc-length
    // or at the end of the coastline
    const shouldSegment =
      currentSegmentLength >= idealSegmentLength * 0.9 || // 90% of ideal
      i === coastlinePoints.length - 1; // Last point

    if (shouldSegment && currentSegment.length > 0) {
      // Calculate stable center point for coordinate-based seeding
      const centerIdx = Math.floor(currentSegment.length / 2);
      const centerPoint = currentSegment[centerIdx];

      segments.push({
        id: segments.length,
        coordinates: currentSegment,
        startPoint: currentSegment[0],
        endPoint: currentSegment[currentSegment.length - 1],
        centerPoint: centerPoint,
        arcLength: currentSegmentLength, // For diagnostics
      });

      currentSegment = [];
      lastSegmentDistance = pointDistance;
    }
  }

  console.log(
    `Segmented into ${segments.length} regions over ${(totalLength / 1000).toFixed(1)}km with ~${(idealSegmentLength / 1000).toFixed(2)}km per segment`
  );
  return segments;
};

// Catmull-Rom spline interpolation to reduce jagged edges and zigzags
export const smoothCoastline = (points, smoothingFactor = 3) => {
  if (points.length < 3) return points;

  // First pass: Simplify zigzags using line simplification
  const simplified = simplifyCoastline(points, 0.00005); // ~5 meters tolerance

  if (simplified.length < 3) return points;

  const smoothed = [simplified[0]];

  for (let i = 1; i < simplified.length; i++) {
    const p0 = simplified[i - 1];
    const p1 = simplified[i];
    const p2 = simplified[i + 1] || simplified[i];
    const p3 = simplified[i + 2] || simplified[i];

    // Interpolate between p1 and p2 with higher resolution
    for (let t = 0; t < smoothingFactor; t++) {
      const u = t / smoothingFactor;
      const u2 = u * u;
      const u3 = u2 * u;

      // Improved Catmull-Rom matrix for smoother curves
      const a = -0.5 * u3 + u2 - 0.5 * u;
      const b = 1.5 * u3 - 2.5 * u2 + 1;
      const c = -1.5 * u3 + 2 * u2 + 0.5 * u;
      const d = 0.5 * u3 - 0.5 * u2;

      const lat = a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0];
      const lng = a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1];

      smoothed.push([lat, lng]);
    }

    smoothed.push(p1);
  }

  return smoothed;
};

// Douglas-Peucker simplification; tolerance is in degrees (0.00005 ~= 5m at equator)
const simplifyCoastline = (points, tolerance = 0.00005) => {
  if (points.length <= 2) return points;

  const simplified = [];
  
  // Helper function to calculate perpendicular distance
  const perpendicularDistance = (point, lineStart, lineEnd) => {
    if (lineStart[0] === lineEnd[0] && lineStart[1] === lineEnd[1]) {
      return calculateDistance(point, lineStart) / 111320; // Convert meters to degrees
    }

    const px = point[1] - lineStart[1];
    const py = point[0] - lineStart[0];
    const dx = lineEnd[1] - lineStart[1];
    const dy = lineEnd[0] - lineStart[0];

    const magnitude = Math.sqrt(dx * dx + dy * dy);
    const distance = Math.abs((dx * py - dy * px) / magnitude);
    
    return distance;
  };

  // Douglas-Peucker recursive function
  const douglasPeucker = (points, tolerance) => {
    let maxDistance = 0;
    let maxIndex = 0;

    // Find the point with the maximum distance from the line
    for (let i = 1; i < points.length - 1; i++) {
      const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const rec1 = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
      const rec2 = douglasPeucker(points.slice(maxIndex), tolerance);
      return rec1.slice(0, rec1.length - 1).concat(rec2);
    } else {
      return [points[0], points[points.length - 1]];
    }
  };

  return douglasPeucker(points, tolerance);
};

/**
 * Get bounding box from coastline
 */
export const getCoastlineBounds = (coastlinePoints) => {
  if (coastlinePoints.length === 0) return null;

  let minLat = coastlinePoints[0][0];
  let maxLat = coastlinePoints[0][0];
  let minLng = coastlinePoints[0][1];
  let maxLng = coastlinePoints[0][1];

  coastlinePoints.forEach((point) => {
    minLat = Math.min(minLat, point[0]);
    maxLat = Math.max(maxLat, point[0]);
    minLng = Math.min(minLng, point[1]);
    maxLng = Math.max(maxLng, point[1]);
  });

  return {
    north: maxLat,
    south: minLat,
    east: maxLng,
    west: minLng,
  };
};

/**
 * Calculate distance between two lat/lng coordinates in meters
 */
export const calculateDistance = (point1, point2) => {
  const R = 6371000; // Earth's radius in meters
  const lat1 = (point1[0] * Math.PI) / 180;
  const lat2 = (point2[0] * Math.PI) / 180;
  const deltaLat = ((point2[0] - point1[0]) * Math.PI) / 180;
  const deltaLng = ((point2[1] - point1[1]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Get total coastline length in kilometers
 */
export const getCoastlineLength = (coastlinePoints) => {
  let totalDistance = 0;

  for (let i = 0; i < coastlinePoints.length - 1; i++) {
    totalDistance += calculateDistance(coastlinePoints[i], coastlinePoints[i + 1]);
  }

  return totalDistance / 1000; // Convert to km
};

// Coastal edges appear exactly once across all municipalities (not shared); same edge-hashing logic as extractCoastline
export const extractCoastalEdges = (geoJsonData, municipalityFeature) => {
  if (!geoJsonData || !geoJsonData.features) {
    console.warn("Invalid GeoJSON data for coastal edge extraction");
    return [];
  }

  if (!municipalityFeature || !municipalityFeature.geometry) {
    return [];
  }

  try {
    // Get all polygon features for edge comparison
    const allPolygons = geoJsonData.features.filter(
      (feature) => feature.geometry && feature.geometry.type === "Polygon"
    );

    if (allPolygons.length === 0) {
      return [];
    }

    // Extract coastal edges from the selected municipality
    const geometry = municipalityFeature.geometry;
    let polygonRings = [];

    if (geometry.type === "Polygon") {
      polygonRings = [geometry.coordinates[0]];
    } else if (geometry.type === "MultiPolygon") {
      polygonRings = geometry.coordinates.map((poly) => poly[0]);
    } else {
      return [];
    }

    const coastalEdges = [];

    // First pass: build edge count map for all municipalities
    const edgeCountMap = new Map();
    allPolygons.forEach((feature) => {
      const geom = feature.geometry;
      if (geom.type !== "Polygon") return;

      const outerRing = geom.coordinates[0];
      if (!Array.isArray(outerRing)) return;

      for (let j = 0; j < outerRing.length - 1; j++) {
        const [lng_a, lat_a] = outerRing[j];
        const [lng_b, lat_b] = outerRing[j + 1];

        const hash = createNormalizedEdgeHash([lat_a, lng_a], [lat_b, lng_b]);
        edgeCountMap.set(hash, (edgeCountMap.get(hash) || 0) + 1);
      }
    });

    // Second pass: identify coastal edges (those appearing exactly once)
    polygonRings.forEach((ring) => {
      if (!Array.isArray(ring) || ring.length < 2) return;

      // Check each edge of this municipality
      for (let i = 0; i < ring.length - 1; i++) {
        const [lng1, lat1] = ring[i];
        const [lng2, lat2] = ring[i + 1];

        const p1 = [lat1, lng1];
        const p2 = [lat2, lng2];

        // Create normalized edge hash for lookup
        const edgeHash = createNormalizedEdgeHash(p1, p2);

        // Check if this specific edge is coastal (count === 1)
        if (edgeCountMap.get(edgeHash) === 1) {
          coastalEdges.push({
            start: p1,
            end: p2,
            coordinates: [p1, p2],
          });
        }
      }
    });

    return coastalEdges;
  } catch (error) {
    console.error("Error extracting coastal edges:", error);
    return [];
  }
};

// Checks distance from the segment's midpoint only, not the full segment, against each coastal edge
const isSegmentOnCoastalEdge = (segmentCoordinates, coastalEdges, tolerance = 500) => {
  if (!Array.isArray(segmentCoordinates) || segmentCoordinates.length === 0) {
    return false;
  }

  // Check if segment's midpoint is near any coastal edge
  const midpoint = segmentCoordinates[Math.floor(segmentCoordinates.length / 2)];

  for (const edge of coastalEdges) {
    if (!Array.isArray(edge) || edge.length < 2) continue;

    // Calculate distance from midpoint to this edge
    for (let i = 0; i < edge.length - 1; i++) {
      const edgeStart = edge[i];
      const edgeEnd = edge[i + 1];
      const distToEdge = distanceToLineSegment(midpoint, edgeStart, edgeEnd);

      if (distToEdge < tolerance) {
        return true;
      }
    }
  }

  return false;
};

// Approximates via planar projection (lng scaled by cos(lat)) since distances involved are small
const distanceToLineSegment = (point, lineStart, lineEnd) => {
  const lat1 = lineStart[0];
  const lng1 = lineStart[1];
  const lat2 = lineEnd[0];
  const lng2 = lineEnd[1];
  const lat = point[0];
  const lng = point[1];

  // Convert to rough planar coordinates to calculate perpendicular distance
  const x1 = lng1 * Math.cos(lat1 * Math.PI / 180);
  const y1 = lat1;
  const x2 = lng2 * Math.cos(lat2 * Math.PI / 180);
  const y2 = lat2;
  const x = lng * Math.cos(lat * Math.PI / 180);
  const y = lat;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag === 0) return calculateDistance(point, lineStart);

  const dist = Math.abs((dy * x - dx * y + x2 * y1 - y2 * x1) / mag);
  return dist * 111320; // Convert degrees to approximate meters
};

// Drops segments sitting on internal municipality boundaries, keeping only true coastal edges (via edge hashing)
export const filterSegmentsToCoastalOnly = (geoJsonData, municipalityFeature, segments) => {
  if (!geoJsonData || !municipalityFeature || !segments || segments.length === 0) {
    return segments;
  }

  try {
    // Extract coastal edges using edge hashing
    const coastalEdges = extractCoastalEdges(geoJsonData, municipalityFeature);

    if (coastalEdges.length === 0) {
      console.warn(`filterSegmentsToCoastalOnly: No coastal edges found for ${municipalityFeature.properties?.MUNICIPALI || "unknown"} - returning all ${segments.length} segments`);
      return segments;
    }

    console.log(`  Extracted ${coastalEdges.length} coastal edge(s) for segment filtering`);

    // Filter segments: keep only those on coastal edges
    const coastalSegments = segments.filter((segment) => {
      if (!segment.shoreline || !Array.isArray(segment.shoreline)) {
        return false;
      }

      const isCoastal = isSegmentOnCoastalEdge(segment.shoreline, coastalEdges);
      
      if (!isCoastal) {
        console.debug(`Filtering out segment ${segment.id || "unknown"} - not on coastal edge`);
      }

      return isCoastal;
    });

    console.log(`Filtered segments: ${segments.length} total → ${coastalSegments.length} coastal for ${municipalityFeature.properties?.MUNICIPALI || "unknown"}`);
    return coastalSegments;
  } catch (error) {
    console.error("Error filtering segments to coastal only:", error);
    return segments; // Return unfiltered on error
  }
};
