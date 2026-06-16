# Documentation to help think through the Foxpost `INVALID_APM_ID` issue

We know that with the current setup:

```ts
        providerId:
          provider === "foxpost"
            ? ["Packeta Z-BOX", "Packeta Z-Pont"].includes(point.raw.variant)
              ? point.raw.place_id
              : point.raw.operator_id
            : point.raw.operator_id,
```

## Success cases

```json
      "raw": {
        "place_id": "574160",
        "operator_id": "hu675",
        "name": "FOXPOST A-BOX Szeged Pláza",
        "ssapt": "",
        "sdapt": "",
        "country": "hu",
        "address": "6724 Szeged, Kossuth Lajos sgrt. 119.", 
        "zip": "6724",
        "city": "Szeged",
        "street": "Kossuth Lajos sgrt. 119.",
        "findme": "HU675 számú kültéri automatánk a mélygarázs lehajtóval szemben, a leghátsó falon, a zöld és sárga parkoló zóna közötti nádas mellett található.<br/><br/><b>Fizetési lehetőség: </b><br/>Fizetés bankkártyával, Fizetés linken keresztül<br/><br/><b>Elérhető szolgáltatások: </b><br/>Csomagfeladás és -átvétel<br/>",
        "geolat": 46.266431,
        "geolng": 20.12887,
        "allowed2": "ALL",
        "depot": "Szeged Depo",
        "load": "normal loaded",
        "isOutdoor": true,
        "apmType": "Rollkon",
        "substitutes": [
          {
            "place_id": "1541375",
            "operator_id": "hu675"
          }
        ],
        "open": {
          "hetfo": "00:00-24:00",
          "kedd": "00:00-24:00",
          "szerda": "00:00-24:00",
          "csutortok": "00:00-24:00",
          "pentek": "00:00-24:00",
          "szombat": "00:00-24:00",
          "vasarnap": "00:00-24:00"
        },
        "fillEmptyList": [
          {
            "emptying": "10:15:00",
            "filling": "11:15:00"
          }
        ],
        "cardPayment": true,
        "cashPayment": false,
        "iconUrl": "https://cdn.foxpost.hu/icons/FOXPOST_icon_low.png",
        "variant": "FOXPOST A-BOX",
        "paymentOptions": [
          "card",
          "link"
        ],
        "paymentOptionsString": "Fizetés bankkártyával, Fizetés linken keresztül",
        "service": [
          "pick up",
          "dispatch"
        ],
        "serviceString": "Csomagfeladás és -átvétel",
        "closeDate": ""
      }
```

Stored in the DB as id: `hu675`

## Failure cases

```json
      "raw": {
        "place_id": "1211382",
        "operator_id": "hu5400",
        "name": "FOXPOST A-BOX Salgótarján Coop Erzsébet tér",
        "ssapt": "",
        "sdapt": "",
        "country": "hu",
        "address": "3100 Salgótarján, Erzsébet tér 2.",
        "zip": "3100",
        "city": "Salgótarján",
        "street": "Erzsébet tér 2.",
        "findme": "HU5400 számú kültéri automatánk az üzlet Rákóczi út felőli oldalán található.<br/><br/><b>Fizetési lehetőség: </b><br/>Fizetés bankkártyával, Fizetés linken keresztül<br/><br/><b>Elérhető szolgáltatások: </b><br/>Csomagfeladás és -átvétel<br/>",
        "geolat": 48.103433,
        "geolng": 19.80626,
        "allowed2": "ALL",
        "depot": "Miskolc Depo",
        "load": "medium loaded",
        "isOutdoor": true,
        "apmType": "Rollkon",
        "substitutes": [
          {
            "place_id": "1541385",
            "operator_id": "hu5400"
          },
          {
            "place_id": "1541330",
            "operator_id": "hu5400"
          }
        ],
        "open": {
          "hetfo": "00:00-24:00",
          "kedd": "00:00-24:00",
          "szerda": "00:00-24:00",
          "csutortok": "00:00-24:00",
          "pentek": "00:00-24:00",
          "szombat": "00:00-24:00",
          "vasarnap": "00:00-24:00"
        },
        "fillEmptyList": [
          {
            "emptying": "09:00:00",
            "filling": "10:00:00"
          }
        ],
        "cardPayment": true,
        "cashPayment": false,
        "iconUrl": "https://cdn.foxpost.hu/icons/FOXPOST_icon_medium.png",
        "variant": "FOXPOST A-BOX",
        "paymentOptions": [
          "card",
          "link"
        ],
        "paymentOptionsString": "Fizetés bankkártyával, Fizetés linken keresztül",
        "service": [
          "pick up",
          "dispatch"
        ],
        "serviceString": "Csomagfeladás és -átvétel",
        "closeDate": ""
      }
```

Stored in the DB as id: `hu5400`

## FOXPOST DOCS

### APM PARCEL CREATION

6.1. PARCELS (NORMAL csomagok létrehozása)
A FoxPost rendszerében az alábbi végpontok hívásával lehet új „normál” (nem visszáru) csomagot létrehozni, illetve már létrejött (CREATE státuszú) csomag adatait módosítani, törölni.

POST/api/parcel
Új normál csomag létrehozására szolgáló végpont.

Egy hívással több csomag is átadható, amennyiben egynél több elemű json kerül átadásra.

Két fajta csomagot különböztetünk meg, egyik típus a csomagautomatába történő szállítás APM), másik pedig a házhozszállításos csomag (továbbiakban HD). A csomagok beküldése történhet vegyesen is, nem kell külön küldeni az APM és a HD rendeléseket.

Request query
Paraméter név	Típus	Leírás
isWeb Opcionális	
Boolean
Megadja, hogy a csomag megjelenjen-e a foxpost.hu oldalon, a Csomagjaim menüpontban (csak foxpost.hu regisztrált ügyfeleknek érhető el). Tesztkörnyezetben (sandbox-ban) való csomag létrehozás során a kérést isWeb = false paraméterrel kell beküldeni.
Engedélyezett értékek: true, false
Alapértelmezett érték: true
Request body
Paraméter név	Típus	Leírás
[] Kötelező	
RequestItem[]
Tetszőleges számú HD vagy APM Request Item tömb.
Request Items
APM Request Item
HD Request Item
Paraméter név	Típus	Leírás
cod Opcionális	Integer	Utánvét értéke.
Minimális érték: 0
Maximális érték: 1000000
Alapértelmezett érték: 0
comment Opcionális	String	Csomaghoz kapcsolódó szöveges kiegészítés (pl. mit tartalmaz a csomag).
Minimális hossz: 0
Maximális hossz: 50
Alapértelmezett érték: null
destination Kötelező	String	A célautomata kódja. Értéke a json fájl operator_id mezője. Abban az esetben ha az operator_id üres küldhető a place_id mező értéke.
label Opcionális	Boolean	Megadja, hogy a Foxpost nyomtasson-e címkét. Csak C2C típusú csomag esetén használatos, üzleti partnerek (webshop-ok) integrációja esetén nem releváns.
recipientEmail Kötelező	String	Címzett email címe, melynek formailag helyes email címnek kell lennie!
recipientName Kötelező	String	Címzett neve
Minimális hossz: 1
Maximális hossz: 150
recipientPhone Kötelező	String	Címzett telefonszáma +36 formátumban. Csak magyarországi mobiltelefon-számokat fogad el a rendszer!
reguláris kifejezés: ^(\+36|36)(20|30|31|70|50|51)\d{7}$
Kérésre, a FoxPost üzleti kapcsolattartójával való egyeztetés alapján, a telefonszám validáció kikapcsolható.
refCode Opcionális	String	Ügyfél-oldali (pl. megrendelés, számla, visszáru) azonosításhoz használható csomagazonosító szám. Értéke tetszőleges lehet, ugyanakkor javasolt egyedivé tenni. Ha kitöltésre kerül, akkor az értéke megjelenik a címkén.
Minimális hossz: 0
Maximális hossz: 30
size Kötelező	String	Csomag mérete, melynek értékét kötelező megadni a csomag létrehozásakor. Azonban a rendszer ezt ekkor még nem veszi figyelembe, így az értéke létrehozáskor lehet fixen például M.
A végleges érték a Foxpost raktári folyamatai során, automatikusan kerül meghatározásra.
Lehetséges értékek: ["XS","S", "M", "L", "XL"] vagy ["1", "2", "3", "4", "5"]
uniqueBarcode Opcionális	String	Egyedi vonalkód, amely csak automatába történő szállítás esetén használható. Ebben az esetben a címkére nem a Foxpost által generált CLFOX kezdetű vonalkód lesz rányomtatva, hanem a webshop által generált vonalkód.
A vonalkódnak egyedinek kell lennie, két egyforma vonalkód nem fordulhat elő a Foxpost rendszerében, ezért fontos, hogy a webshop gondoskodjon a vonalkód egyediségéről.
Kérjük, hogy az átadandó kódokat ún. hibrid, legalább 4 betűt és legalább 4 számot tartalmazó azonosítók használatával tegyék egyedivé. A betűk lehetőség szerint utaljanak az adott partnerre.
Például: FIRMA987654321
Amennyiben olyan vonalkód kerül átadásra, ami már létezik a rendszerben, úgy a csomag létrehozása sikertelen lesz (DUPLICATED_UNIQUE_BARCODE hibakód).
Minimális hossz: 0
Maximális hossz: 20

### PICKUP POINT FETCHING

4. CSOMAGAUTOMATA (APM) LISTA (JSON)
A FoxPost csomagautomatáinak (https://foxpost.hu/csomagautomatak) folyamatosan, óránként frissülő listája az alábbi címen érhető el:

https://cdn.foxpost.hu/foxplus.json
Új csomagautomata telepítése, illetve a meglévők megszűnése/inaktiválása is ebben a json fájlban követhető.

Az állomány mezőinek leírása:

Mező neve	Leírás
place_id	Automata azonosítója, új kapcsolat esetén nem ezt, hanem az operator_id-t kell használni. Packetás automaták és átvételi pontok esetén ezt a mezőt kell használni.
operator_id	Automata azonosítója, új kapcsolat esetén ezt a mezőt szükséges használni! Abban az esetben ha az operator_id üres a place_id mezőt kell használni.
name	Automata neve
ssapt	Csak adott típusú csomagok fogadására alkalmas automata, új kapcsolat esetén nem releváns
sdapt	Csak adott típusú csomagok fogadására alkalmas automata, új kapcsolat esetén nem releváns
country	Automata helyének országkódja (ISO 3166-1 alpha-2 szabvány szerint lesznek megadva)
address	Automata helyének teljes címe
zip	Automata helyének irányítószáma
city	Automata helyének települése
street	Automata helyének közterülete (közterület név, jelleg, házszám)
findme	Megtalálhatóság, az adott helyen (címen) belül hol található az automata
geolat	GPS szélességi koordináta
geolng	GPS hosszúsági koordináta
allowed2	Megadja, hogy az adott automatából milyen típusú csomagot lehet küldeni.
Lehetséges értékei:
"ALL" - bármilyen típusú csomag küldhető
"C2C" - csak C2C csomag adható fel
"B2C" - csak B2C csomag adható fel
depot	Megadja, hogy az automata melyik depóhoz tartozik.
load	Automata telítettsége
Lehetséges értékei:
normal loaded
medium loaded
overloaded
isOutdoor	Megadja, hogy az automata kültéren helyezkedik-e el.
Lehetséges értékei (boolean):
true
false
apmType	Automata gyártó szerinti típusa.
Lehetséges értékei:
Cleveron
Keba
Rollkon
Rotte
substitutes	Automata (telítettség esetén automatikus átirányítást lehetővé tevő) helyettesítő automatája/automatái
open	Nyitvatartási idő, napok szerint
fillEmptyList	Megadja azokat az időszakokat, amikor az adott automatába elhelyezésre (filling), illetve, amikor onnan elszállításra (emptying) kerülnek a csomagok.
cardPayment	Megadja, hogy az automatánál lehetségese bankkártyával fizetni.
Lehetséges értékei:
true
false
cashPayment	Megadja, hogy lehetségese készpénzzel fizetni.
Lehetséges értékei:
true
false
iconUrl	Megadja az automatához felhasználható icon-t
variant	Megadja hogy az adott automata FOXPOST A-BOX, FOXPOST Z-BOX, Packeta Z-BOX, vagy Packeta Z-Pont
paymentOptions	Megadja a lehetséges fizetési módokat egységesített formában.
Lehetséges értékei:
card
cash
link
app
paymentOptionsString	Megadja a lehetséges fizetési módokat.
Lehetséges értékei:
Fizetés bankkártyával
Fizetés készpénzzel
Fizetés Packeta applikáción keresztül
Fizetés linken keresztül
service	Megadja az automatán elérhető szolgáltatásokat egységesített formában.
Lehetséges értékei:
dispatch
pick up
serviceString	Megadja az autamatán elérhető szolgáltatásokat
Lehetséges értékei:
Csomagfeladás és -átvétel
Csak csomagátvétel