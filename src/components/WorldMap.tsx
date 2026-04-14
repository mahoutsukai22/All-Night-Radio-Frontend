import { type PointerEvent, type WheelEvent, useEffect, useRef, useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Marker,
  Sphere,
} from 'react-simple-maps';
import type { RadioStation } from '../lib/radio';

const geoUrl =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const MIN_GLOBE_SCALE = 180;
const ZOOM_SENSITIVITY = 0.35;

type Props = {
  activeStationId?: string;
  onCountryClick: (country: string) => void;
  onStationSelect: (station: RadioStation) => void;
  selectedCountry: string;
  stations: RadioStation[];
};

type Rotation = [number, number, number];

type DragState = {
  pointerX: number;
  pointerY: number;
  rotation: Rotation;
};

const clampLatitude = (value: number) => Math.max(-55, Math.min(55, value));
const clampScale = (value: number) => Math.max(MIN_GLOBE_SCALE, value);

export default function WorldMap({
  activeStationId,
  onCountryClick,
  onStationSelect,
  selectedCountry,
  stations,
}: Props) {
  const [rotation, setRotation] = useState<Rotation>([8, -18, 0]);
  const [scale, setScale] = useState(265);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.pointerX;
      const deltaY = event.clientY - dragState.pointerY;

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        suppressClickRef.current = true;
      }

      setRotation([
        dragState.rotation[0] + deltaX * 0.35,
        clampLatitude(dragState.rotation[1] - deltaY * 0.35),
        0,
      ]);
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      rotation,
    };

    suppressClickRef.current = false;
    setIsDragging(true);
  };

  const handleCountrySelect = (country: string) => {
    if (suppressClickRef.current) {
      return;
    }

    onCountryClick(country);
  };

  const handleStationSelect = (station: RadioStation) => {
    if (suppressClickRef.current) {
      return;
    }

    onStationSelect(station);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    setScale((current) => clampScale(current - event.deltaY * ZOOM_SENSITIVITY));
  };

  return (
    <div
      className={isDragging ? 'world-map-frame world-map-frame-dragging' : 'world-map-frame'}
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
    >
      <ComposableMap
        className="world-map-svg"
        height={620}
        projection="geoOrthographic"
        projectionConfig={{
          rotate: rotation,
          scale,
        }}
        width={960}
      >
        <Sphere
          className="map-sphere"
          fill="rgba(18, 48, 32, 0.97)"
          stroke="rgba(131, 255, 163, 0.22)"
          strokeWidth={1.5}
        />
        <Graticule
          className="map-graticule"
          stroke="rgba(144, 255, 172, 0.09)"
        />

        <Geographies geography={geoUrl}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo) => {
              const countryName = geo.properties.name;
              const isSelected = selectedCountry === countryName;

              return (
                <Geography
                  className="map-country"
                  geography={geo}
                  key={geo.rsmKey}
                  onClick={() => handleCountrySelect(countryName)}
                  style={{
                    default: {
                      fill: '#234f38',
                      outline: 'none',
                      stroke: isSelected
                        ? 'rgba(212, 255, 209, 0.92)'
                        : 'rgba(131, 255, 163, 0.18)',
                      strokeWidth: isSelected ? 1.2 : 0.5,
                    },
                    hover: {
                      fill: '#234f38',
                      outline: 'none',
                      stroke: 'rgba(212, 255, 209, 0.9)',
                      strokeWidth: 1.2,
                    },
                    pressed: {
                      fill: '#234f38',
                      stroke: 'rgba(212, 255, 209, 0.96)',
                      strokeWidth: 1.25,
                      outline: 'none',
                    },
                  }}
                />
              );
            })
          }
        </Geographies>

        {stations.map((station) => {
          if (
            typeof station.geo_lat !== 'number' ||
            typeof station.geo_long !== 'number'
          ) {
            return null;
          }

          const isActive = station.stationuuid === activeStationId;
          const radius = isActive
            ? 7
            : Math.max(
                2.5,
                Math.min(5, 2.5 + (station.clickcount ?? 0) / 800)
              );

          return (
            <Marker
              coordinates={[station.geo_long, station.geo_lat]}
              key={station.stationuuid}
              onClick={() => handleStationSelect(station)}
            >
              <circle
                className={
                  isActive
                    ? 'station-marker station-marker-active'
                    : 'station-marker'
                }
                cx={0}
                cy={0}
                r={radius}
              />
              {isActive && (
                <circle
                  className="station-marker-pulse"
                  cx={0}
                  cy={0}
                  r={radius + 6}
                />
              )}
            </Marker>
          );
        })}
      </ComposableMap>
    </div>
  );
}
