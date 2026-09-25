export type CountryOption = {
  code: string;
  name: string;
  currency: string;
  languageCode: string;
  language: string;
};

// The 193 UN member states plus the Holy See and the State of Palestine.
// Currency and language identify the default used during business setup; owners can
// later change either choice in Settings.
const countryRows = `
AF|Afghanistan|AFN|fa|Dari
AL|Albania|ALL|sq|Albanian
DZ|Algeria|DZD|ar|Arabic
AD|Andorra|EUR|ca|Catalan
AO|Angola|AOA|pt|Portuguese
AG|Antigua and Barbuda|XCD|en|English
AR|Argentina|ARS|es|Spanish
AM|Armenia|AMD|hy|Armenian
AU|Australia|AUD|en|English
AT|Austria|EUR|de|German
AZ|Azerbaijan|AZN|az|Azerbaijani
BS|Bahamas|BSD|en|English
BH|Bahrain|BHD|ar|Arabic
BD|Bangladesh|BDT|bn|Bengali
BB|Barbados|BBD|en|English
BY|Belarus|BYN|be|Belarusian
BE|Belgium|EUR|nl|Dutch
BZ|Belize|BZD|en|English
BJ|Benin|XOF|fr|French
BT|Bhutan|BTN|dz|Dzongkha
BO|Bolivia|BOB|es|Spanish
BA|Bosnia and Herzegovina|BAM|bs|Bosnian
BW|Botswana|BWP|en|English
BR|Brazil|BRL|pt|Portuguese
BN|Brunei|BND|ms|Malay
BG|Bulgaria|BGN|bg|Bulgarian
BF|Burkina Faso|XOF|fr|French
BI|Burundi|BIF|fr|French
CV|Cabo Verde|CVE|pt|Portuguese
KH|Cambodia|KHR|km|Khmer
CM|Cameroon|XAF|fr|French
CA|Canada|CAD|en|English
CF|Central African Republic|XAF|fr|French
TD|Chad|XAF|fr|French
CL|Chile|CLP|es|Spanish
CN|China|CNY|zh|Chinese
CO|Colombia|COP|es|Spanish
KM|Comoros|KMF|fr|French
CG|Congo|XAF|fr|French
CR|Costa Rica|CRC|es|Spanish
CI|Côte d’Ivoire|XOF|fr|French
HR|Croatia|EUR|hr|Croatian
CU|Cuba|CUP|es|Spanish
CY|Cyprus|EUR|el|Greek
CZ|Czechia|CZK|cs|Czech
KP|Democratic People's Republic of Korea|KPW|ko|Korean
CD|Democratic Republic of the Congo|CDF|fr|French
DK|Denmark|DKK|da|Danish
DJ|Djibouti|DJF|fr|French
DM|Dominica|XCD|en|English
DO|Dominican Republic|DOP|es|Spanish
EC|Ecuador|USD|es|Spanish
EG|Egypt|EGP|ar|Arabic
SV|El Salvador|USD|es|Spanish
GQ|Equatorial Guinea|XAF|es|Spanish
ER|Eritrea|ERN|ti|Tigrinya
EE|Estonia|EUR|et|Estonian
SZ|Eswatini|SZL|en|English
ET|Ethiopia|ETB|am|Amharic
FJ|Fiji|FJD|en|English
FI|Finland|EUR|fi|Finnish
FR|France|EUR|fr|French
GA|Gabon|XAF|fr|French
GM|Gambia|GMD|en|English
GE|Georgia|GEL|ka|Georgian
DE|Germany|EUR|de|German
GH|Ghana|GHS|en|English
GR|Greece|EUR|el|Greek
GD|Grenada|XCD|en|English
GT|Guatemala|GTQ|es|Spanish
GN|Guinea|GNF|fr|French
GW|Guinea-Bissau|XOF|pt|Portuguese
GY|Guyana|GYD|en|English
HT|Haiti|HTG|fr|French
VA|Holy See|EUR|it|Italian
HN|Honduras|HNL|es|Spanish
HU|Hungary|HUF|hu|Hungarian
IS|Iceland|ISK|is|Icelandic
IN|India|INR|hi|Hindi
ID|Indonesia|IDR|id|Indonesian
IR|Iran|IRR|fa|Persian
IQ|Iraq|IQD|ar|Arabic
IE|Ireland|EUR|en|English
IL|Israel|ILS|he|Hebrew
IT|Italy|EUR|it|Italian
JM|Jamaica|JMD|en|English
JP|Japan|JPY|ja|Japanese
JO|Jordan|JOD|ar|Arabic
KZ|Kazakhstan|KZT|kk|Kazakh
KE|Kenya|KES|sw|Swahili
KI|Kiribati|AUD|en|English
KW|Kuwait|KWD|ar|Arabic
KG|Kyrgyzstan|KGS|ky|Kyrgyz
LA|Laos|LAK|lo|Lao
LV|Latvia|EUR|lv|Latvian
LB|Lebanon|LBP|ar|Arabic
LS|Lesotho|LSL|en|English
LR|Liberia|LRD|en|English
LY|Libya|LYD|ar|Arabic
LI|Liechtenstein|CHF|de|German
LT|Lithuania|EUR|lt|Lithuanian
LU|Luxembourg|EUR|lb|Luxembourgish
MG|Madagascar|MGA|mg|Malagasy
MW|Malawi|MWK|en|English
MY|Malaysia|MYR|ms|Malay
MV|Maldives|MVR|dv|Dhivehi
ML|Mali|XOF|fr|French
MT|Malta|EUR|mt|Maltese
MH|Marshall Islands|USD|en|English
MR|Mauritania|MRU|ar|Arabic
MU|Mauritius|MUR|en|English
MX|Mexico|MXN|es|Spanish
FM|Micronesia|USD|en|English
MD|Moldova|MDL|ro|Romanian
MC|Monaco|EUR|fr|French
MN|Mongolia|MNT|mn|Mongolian
ME|Montenegro|EUR|sr|Serbian
MA|Morocco|MAD|ar|Arabic
MZ|Mozambique|MZN|pt|Portuguese
MM|Myanmar|MMK|my|Burmese
NA|Namibia|NAD|en|English
NR|Nauru|AUD|en|English
NP|Nepal|NPR|ne|Nepali
NL|Netherlands|EUR|nl|Dutch
NZ|New Zealand|NZD|en|English
NI|Nicaragua|NIO|es|Spanish
NE|Niger|XOF|fr|French
NG|Nigeria|NGN|en|English
MK|North Macedonia|MKD|mk|Macedonian
NO|Norway|NOK|no|Norwegian
OM|Oman|OMR|ar|Arabic
PK|Pakistan|PKR|ur|Urdu
PW|Palau|USD|en|English
PA|Panama|PAB|es|Spanish
PG|Papua New Guinea|PGK|en|English
PY|Paraguay|PYG|es|Spanish
PE|Peru|PEN|es|Spanish
PH|Philippines|PHP|fil|Filipino
PL|Poland|PLN|pl|Polish
PT|Portugal|EUR|pt|Portuguese
QA|Qatar|QAR|ar|Arabic
KR|Republic of Korea|KRW|ko|Korean
RO|Romania|RON|ro|Romanian
RU|Russia|RUB|ru|Russian
RW|Rwanda|RWF|rw|Kinyarwanda
KN|Saint Kitts and Nevis|XCD|en|English
LC|Saint Lucia|XCD|en|English
VC|Saint Vincent and the Grenadines|XCD|en|English
WS|Samoa|WST|sm|Samoan
SM|San Marino|EUR|it|Italian
ST|Sao Tome and Principe|STN|pt|Portuguese
SA|Saudi Arabia|SAR|ar|Arabic
SN|Senegal|XOF|fr|French
RS|Serbia|RSD|sr|Serbian
SC|Seychelles|SCR|en|English
SL|Sierra Leone|SLE|en|English
SG|Singapore|SGD|en|English
SK|Slovakia|EUR|sk|Slovak
SI|Slovenia|EUR|sl|Slovenian
SB|Solomon Islands|SBD|en|English
SO|Somalia|SOS|so|Somali
ZA|South Africa|ZAR|en|English
SS|South Sudan|SSP|en|English
ES|Spain|EUR|es|Spanish
LK|Sri Lanka|LKR|si|Sinhala
PS|State of Palestine|ILS|ar|Arabic
SD|Sudan|SDG|ar|Arabic
SR|Suriname|SRD|nl|Dutch
SE|Sweden|SEK|sv|Swedish
CH|Switzerland|CHF|de|German
SY|Syria|SYP|ar|Arabic
TJ|Tajikistan|TJS|tg|Tajik
TZ|Tanzania|TZS|sw|Swahili
TH|Thailand|THB|th|Thai
TL|Timor-Leste|USD|pt|Portuguese
TG|Togo|XOF|fr|French
TO|Tonga|TOP|to|Tongan
TT|Trinidad and Tobago|TTD|en|English
TN|Tunisia|TND|ar|Arabic
TR|Türkiye|TRY|tr|Turkish
TM|Turkmenistan|TMT|tk|Turkmen
TV|Tuvalu|AUD|en|English
UG|Uganda|UGX|en|English
UA|Ukraine|UAH|uk|Ukrainian
AE|United Arab Emirates|AED|ar|Arabic
GB|United Kingdom|GBP|en|English
US|United States|USD|en|English
UY|Uruguay|UYU|es|Spanish
UZ|Uzbekistan|UZS|uz|Uzbek
VU|Vanuatu|VUV|bi|Bislama
VE|Venezuela|VES|es|Spanish
VN|Viet Nam|VND|vi|Vietnamese
YE|Yemen|YER|ar|Arabic
ZM|Zambia|ZMW|en|English
ZW|Zimbabwe|ZWG|en|English`;

export const countryOptions: CountryOption[] = countryRows.trim().split("\n").map((row) => {
  const [code, name, currency, languageCode, language] = row.split("|");
  return { code, name, currency, languageCode, language };
});

// India has several constitutionally recognised languages. Present its common
// business choices directly in the language selector as requested.
export const languageOptions = countryOptions.flatMap((country) => {
  const options = [{ name: country.language, locale: country.languageCode, country: country.name }];
  return country.code === "IN"
    ? [...options, { name: "Marathi", locale: "mr", country: country.name }]
    : options;
});

export function findCountry(value?: string | null) {
  const normalized = value?.trim().toLocaleLowerCase();
  return countryOptions.find((country) => country.name.toLocaleLowerCase() === normalized || country.code.toLocaleLowerCase() === normalized);
}
