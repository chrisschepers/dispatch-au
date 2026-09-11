export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
};
export const suggestedPlaces: Place[] = [
  {
    id: 'melbourne',
    name: 'Melbourne',
    lat: -37.8136,
    lng: 144.9631,
    radius: 25,
  },
  { id: 'geelong', name: 'Geelong', lat: -38.1499, lng: 144.3617, radius: 25 },
  {
    id: 'ballarat',
    name: 'Ballarat',
    lat: -37.5622,
    lng: 143.8503,
    radius: 25,
  },
  { id: 'bendigo', name: 'Bendigo', lat: -36.757, lng: 144.2794, radius: 25 },
  {
    id: 'frankston',
    name: 'Frankston',
    lat: -38.1415,
    lng: 145.1225,
    radius: 25,
  },
  {
    id: 'shepparton',
    name: 'Shepparton',
    lat: -36.3833,
    lng: 145.4,
    radius: 25,
  },
  { id: 'wodonga', name: 'Wodonga', lat: -36.1217, lng: 146.8881, radius: 25 },
  {
    id: 'warrnambool',
    name: 'Warrnambool',
    lat: -38.3833,
    lng: 142.4833,
    radius: 25,
  },
  {
    id: 'traralgon',
    name: 'Traralgon',
    lat: -38.1953,
    lng: 146.5415,
    radius: 25,
  },
  { id: 'mildura', name: 'Mildura', lat: -34.1855, lng: 142.1625, radius: 25 },
];
