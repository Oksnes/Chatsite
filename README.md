# DOKUMENTASJON


Jeg har laget en database med 3 tabeller

Jeg har tenk til å ha en chat side der folk har profil bilder, Kan sende meldinger med og uten bilder og kan snakke i flere forskjellige kanaler, denne databasen lar meg gjøre dette.

| User | Datatype |
|-------|--------|
|UserID|INTEGER|
|Username|TEXT|
|Password|TEXT|
|ProfilePicture|TEXT|
|Admin|INT|  

|Messages|Datatype|
|--------|--------|
|messageID|INTEGER|
|Content|TEXT|
|UserID|INTEGER|
|ImagePath|TEXT|
|ChannelID|INTEGER|
|Time|TEXT|

|Channel|Datatype|
|-------|-------|
|ChannelID|INTEGER|
|ChannelName|TEXT|

