/* Adapted from https://github.com/wandergis/coordTransform_py (MIT):
Copyright (c) 2015 WangMing

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import type { Coordinate } from '../geo';
import type { MapRegion } from '../presentation';

export function wgsToGcj(p: Coordinate): Coordinate {
  const {longitude: lon, latitude: lat} = p;
  if (!(lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55)) return p;
  const x=lon-105, y=lat-35, pi=Math.PI;
  const common=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
  let dy=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
  let dx=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
  dy+=common+(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3;
  dy+=(160*Math.sin(y/12*pi)+320*Math.sin(y/30*pi))*2/3;
  dx+=common+(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;
  dx+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
  const rad=lat*pi/180, e=0.00669342162296594323, magic=1-e*Math.sin(rad)**2;
  return {latitude:lat+dy*180/((6378245*(1-e)/(magic*Math.sqrt(magic)))*pi),
    longitude:lon+dx*180/((6378245/Math.sqrt(magic))*Math.cos(rad)*pi)};
}
export function gcjToWgs(p: Coordinate): Coordinate {
  let guess=p;
  for(let i=0;i<5;i++) {const mapped=wgsToGcj(guess);guess={latitude:guess.latitude+p.latitude-mapped.latitude,longitude:guess.longitude+p.longitude-mapped.longitude};}
  return guess;
}
export function convertRegion(r: MapRegion, convert: (p: Coordinate)=>Coordinate): MapRegion {
  const sw=convert({latitude:r.latitude-r.latitudeDelta/2,longitude:r.longitude-r.longitudeDelta/2});
  const ne=convert({latitude:r.latitude+r.latitudeDelta/2,longitude:r.longitude+r.longitudeDelta/2});
  return {...convert(r),latitudeDelta:ne.latitude-sw.latitude,longitudeDelta:ne.longitude-sw.longitude};
}
