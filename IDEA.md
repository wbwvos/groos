Ik heb een idee. Ik wil en een process laten draaien op mijn computer dat elke week mijn winkelmandje vult in een online boodschappenwinkel. Bijvoorbeeld Albert Heijn, Crisp, Picnic of iets anders. Ik wil namelijk onze weekboodschappen automatiseren. Ik zou graag op een vast moment in de week een berichtje krijgen dat onze nieuwe weekboodschappen klaar staan. Hier moeten 2-3 avondmaaltijden in zitten, onze dagelijkse benodigdheden zoals havermelk en havermout zodat we kunnen ontbijten. Daarnaast wil ik ook dat er gevarieerd wordt met fruit en ook wat lekkers (chips of koek). In eerste instantie kunnen we gewoon het vullen van het mandje automatiseren, later wil ik ook graag een aantal andere features zoals:
- Conversational ordering: dat we door middel van een gesprek (bijvoorbeeld via signal of whatsapp) met zn drieen (een agent, mijn vriendin en ik) de boodschappen kunnen afstemmen. 
- Dat we door de week heen ook kunnen aangeven wat er op is of waar we zin in hebben
- Dat de agent een paar suggesties doet voor onze avondmaaltijden. 
- De avondmaaltijden kunnen in eerste instantie van de boodschappenwinkels geselecteerd worden, maar wellicht kan hij/zij later ook wat lekkers voorstellen?
- Bezorgtijden overleggen

Ik ga er van uit dat we nog steeds zelfs moeten bestellen en betalen, dus dat kunnen we zelf wel doen maar het vullen van het mandje is het belangrijkst.

Ik las dat er een Home Assistant module is for Picnic. Daarnaast heb ik ook een npm plugin gevonden voor picnic. Dus misschien kunnen we wel wat code hergebruiken.
- https://www.npmjs.com/package/picnic-api
- https://github.com/mikebrink/home-assistant-picnic

Nou laten we samen een plan maken hoe we dit kunnen draaien. Voor nu zal het op mijn windows laptop met WSL draaien maar later wellicht op een Mac Mini of een MiniPC (linux).

Voor communicatie, is WhatsApp mogelijk? Of misschien Signal? Of misschien iMessage (we hebben beide een iPhone).