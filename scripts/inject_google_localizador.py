#!/usr/bin/env python3
"""Inject Google Maps as a Leaflet basemap in the deployed VisionSite index."""

from pathlib import Path
import sys


SCRIPT_ANCHOR = '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>'
SCRIPT_INJECTION = """<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="/google-maps-config.js"></script>
<script src="/Leaflet.GoogleMutant.js"></script>"""

MAP_ANCHOR = """const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
const rail=L.tileLayer('https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',{maxZoom:19,opacity:.45,attribution:'OpenRailwayMap'}).addTo(map);
derailmentLayer.addTo(map);"""

MAP_INJECTION = """const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
const rail=L.tileLayer('https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',{maxZoom:19,opacity:.45,attribution:'OpenRailwayMap'}).addTo(map);

const visionBaseLayers={'OpenStreetMap · Respaldo':osm};
const visionOverlays={'Red ferroviaria':rail};
const visionLayerControl=L.control.layers(visionBaseLayers,visionOverlays,{position:'topleft',collapsed:true}).addTo(map);
let visionGoogleLayers=[];
let visionGoogleMapsPromise=null;

const VisionMapStatus=L.Control.extend({
  options:{position:'bottomleft'},
  onAdd:function(){
    this._el=L.DomUtil.create('div','vision-map-status');
    Object.assign(this._el.style,{background:'rgba(7,30,55,.92)',color:'#fff',padding:'5px 9px',borderRadius:'6px',font:'600 11px system-ui',boxShadow:'0 1px 5px rgba(0,0,0,.35)'});
    this._el.textContent='Mapa: OpenStreetMap';
    L.DomEvent.disableClickPropagation(this._el);
    return this._el;
  },
  setText:function(text){if(this._el)this._el.textContent=text;}
});
const visionMapStatus=new VisionMapStatus().addTo(map);

function visionUseOsm(reason){
  visionGoogleLayers.forEach(layer=>{if(map.hasLayer(layer))map.removeLayer(layer);});
  if(!map.hasLayer(osm))osm.addTo(map);
  visionMapStatus.setText(reason?'Mapa: OpenStreetMap · respaldo':'Mapa: OpenStreetMap');
  if(reason)console.warn('VisionSite: Google Maps no disponible; se activó OpenStreetMap.',reason);
}

function visionLoadGoogleMaps(){
  if(window.google&&window.google.maps)return Promise.resolve();
  if(visionGoogleMapsPromise)return visionGoogleMapsPromise;
  visionGoogleMapsPromise=new Promise((resolve,reject)=>{
    const key=String(window.VISION_GOOGLE_MAPS_API_KEY||'').trim();
    if(!key){reject(new Error('Falta la configuración de Google Maps.'));return;}
    const callback='__visionLocalizadorGoogleReady';
    const timeout=setTimeout(()=>reject(new Error('Google Maps demoró demasiado en responder.')),15000);
    window[callback]=()=>{clearTimeout(timeout);delete window[callback];resolve();};
    window.gm_authFailure=()=>{clearTimeout(timeout);reject(new Error('Google rechazó la clave configurada.'));visionUseOsm('Error de autorización');};
    const script=document.createElement('script');
    script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback='+callback+'&v=weekly';
    script.async=true;
    script.onerror=()=>{clearTimeout(timeout);reject(new Error('No se pudo cargar Google Maps.'));};
    document.head.appendChild(script);
  });
  return visionGoogleMapsPromise;
}

async function visionInitGoogleBasemaps(){
  try{
    visionMapStatus.setText('Mapa: conectando con Google…');
    await visionLoadGoogleMaps();
    if(!L.gridLayer||!L.gridLayer.googleMutant)throw new Error('No se cargó el adaptador de Google Maps.');
    const googleRoad=L.gridLayer.googleMutant({type:'roadmap',maxZoom:21});
    const googleSatellite=L.gridLayer.googleMutant({type:'hybrid',maxZoom:21});
    const googleTerrain=L.gridLayer.googleMutant({type:'terrain',maxZoom:21});
    visionGoogleLayers=[googleRoad,googleSatellite,googleTerrain];
    visionLayerControl.addBaseLayer(googleRoad,'Google Maps');
    visionLayerControl.addBaseLayer(googleSatellite,'Google Satélite');
    visionLayerControl.addBaseLayer(googleTerrain,'Google Relieve');
    map.on('baselayerchange',event=>{
      visionMapStatus.setText('Mapa: '+(event.name.startsWith('OpenStreetMap')?'OpenStreetMap':event.name));
    });
    if(map.hasLayer(osm))map.removeLayer(osm);
    googleRoad.addTo(map);
    visionMapStatus.setText('Mapa: Google Maps');
  }catch(error){
    visionUseOsm(error&&error.message?error.message:String(error));
  }
}

visionInitGoogleBasemaps();
derailmentLayer.addTo(map);"""


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Se esperaba exactamente una coincidencia para {label}; se encontraron {count}.")
    return source.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: inject_google_localizador.py RUTA_INDEX")
    index_path = Path(sys.argv[1])
    source = index_path.read_text(encoding="utf-8")
    if "__visionLocalizadorGoogleReady" in source:
        raise SystemExit("El Localizador ya contiene la integración de Google Maps.")
    source = replace_once(source, SCRIPT_ANCHOR, SCRIPT_INJECTION, "los scripts de Leaflet")
    source = replace_once(source, MAP_ANCHOR, MAP_INJECTION, "la inicialización del mapa")
    index_path.write_text(source, encoding="utf-8")
    print(f"Google Maps integrado en {index_path}")


if __name__ == "__main__":
    main()
