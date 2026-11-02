import { projectMapsUrl } from './domain';
export default function ProjectCoordinates({
  latitude,
  longitude,
}: {
  latitude?: number;
  longitude?: number;
}) {
  const href = projectMapsUrl(latitude, longitude);
  if (!href) return null;
  return (
    <p>
      <a
        className="project-coordinates"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`เปิด Google Maps ที่พิกัด ${latitude}, ${longitude}`}
      >
        Lat {latitude}, Lng {longitude}
      </a>
    </p>
  );
}
