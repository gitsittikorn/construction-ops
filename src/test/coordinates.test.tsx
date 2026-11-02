import { render, screen } from '@testing-library/react';
import {
  parseCoordinateInput,
  parseProjectCoordinates,
  projectMapsUrl,
  validateProject,
} from '../domain';
import ProjectCoordinates from '../ProjectCoordinates';
const project = {
  id: 'p',
  name: 'Site',
  customer: '',
  location: '',
  startDate: '',
  endDate: '',
  status: 'active' as const,
  description: '',
  createdAt: 'now',
  updatedAt: 'now',
};
it('parses a single comma-separated field with or without spaces', () => {
  expect(parseCoordinateInput(' 13.7563 , 100.5018 ')).toEqual({
    latitude: 13.7563,
    longitude: 100.5018,
  });
  expect(parseCoordinateInput('0,0')).toEqual({ latitude: 0, longitude: 0 });
  expect(parseCoordinateInput('-13.1234567,100.7654321')).toEqual({
    latitude: -13.1234567,
    longitude: 100.7654321,
  });
  expect(parseCoordinateInput(' ')).toEqual({});
});
it('rejects malformed, incomplete and out-of-range combined input', () => {
  for (const value of [
    '13.5',
    '13.5,',
    ',100.5',
    '13 100',
    '13,100,1',
    'text,100',
    '0x1,2',
    '91,100',
    '13,-181',
  ])
    expect(() => parseCoordinateInput(value)).toThrow();
});
it('keeps old projects valid with no coordinates and allows clearing both fields', () => {
  expect(() => validateProject(project)).not.toThrow();
  expect(parseProjectCoordinates('', ' ')).toEqual({});
});
it('accepts zero, negative and boundary coordinates without dropping precision', () => {
  expect(parseProjectCoordinates('0', '0')).toEqual({ latitude: 0, longitude: 0 });
  expect(parseProjectCoordinates('-13.1234567', '100.7654321')).toEqual({
    latitude: -13.1234567,
    longitude: 100.7654321,
  });
  expect(projectMapsUrl(-90, -180)).not.toBeNull();
  expect(projectMapsUrl(90, 180)).not.toBeNull();
});
it('rejects incomplete, non-finite and out-of-range coordinate pairs', () => {
  for (const [lat, lng] of [
    ['13', ''],
    ['', '100'],
    ['91', '100'],
    ['13', '181'],
    ['-91', '100'],
    ['13', '-181'],
    ['NaN', '100'],
    ['13', 'Infinity'],
  ])
    expect(() => parseProjectCoordinates(lat, lng)).toThrow();
  expect(() => validateProject({ ...project, latitude: 13 })).toThrow();
  expect(() => validateProject({ ...project, latitude: 13, longitude: Infinity })).toThrow();
});
it('constructs a Google Maps search URL in latitude-longitude order', () => {
  const url = new URL(projectMapsUrl(13.7563, 100.5018)!);
  expect(url.origin).toBe('https://www.google.com');
  expect(url.searchParams.get('api')).toBe('1');
  expect(url.searchParams.get('query')).toBe('13.7563,100.5018');
});
it('makes the coordinate numbers clickable and opens Maps in a separate tab', () => {
  render(<ProjectCoordinates latitude={0} longitude={0} />);
  const link = screen.getByRole('link', { name: 'เปิด Google Maps ที่พิกัด 0, 0' });
  expect(link).toHaveAttribute('href', projectMapsUrl(0, 0));
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
it('does not render a broken map link for absent or invalid coordinates', () => {
  const view = render(<ProjectCoordinates />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  view.rerender(<ProjectCoordinates latitude={100} longitude={0} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
