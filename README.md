SV Krishna is my much cherished Yacht which I sail on the east coast of Scotland, predominantly in the Firth of Forth, out of Port Edgar Marina.

I love to sail and out of season I love to tinker. One winter I had been exploring the option of steering Krishna to the wind by combining my existing wind direction indicator with my tiller pilot. The typical solution would be to use a Windvane which would have been overkill on a sub 30ft boat cruising the coast.

The first of many head scratching moments was trying to understand how I could get two incompatible systems to talk to one another. My wind indicator was manufactured by NASA Marine and uses a communication protocol called NMEA-0183, whereas my Raymarine tiller pilot uses a protocol called Seatalk. Internet searches provided solutions which on the face of things appeared to provide an answer. A simple 'bridge' could be installed between devices which would act as translator - so I installed a Raymarine E85001. 

What I hadn't appreciated is that there are subversions of NMEA-0183. NASA Marine uses the earliest (v1 - single-ended), and probably least adopted version compatible with the likes of very early generation Garmin GPS devices. The more common being NMEA-0183 v2 - differential. So something else was needed between the NASA wind and E85001 to translate for the translator! I also needed to be able to understand what was coming from the NASA Wind instrument so I could verify that it was producing the right output before investing heavily in more time. 

The answer to the NASA NMEA compatibility issue was to connect the NMEA output to a serial cable and change the wiring. I was delighted when I found this solution and even more delighted when I plugged the USB end of the cable into my laptop and saw the output appear on screen. The next challenge was to get the data from the USB cable to the E85001. On the boat I already use a Quark-Elec A026, which is a GPS, AIS receiver and NMEA0183 multiplexor. The A026 has a USB port, but it needs this as its power supply - so this wasn't an option. In my search for a solution, I had read about Rasberry Pi which I'd put on my shortlist for future winter tinkering, so decided that now was the time to take the plunge. 

Software for Raspberry Pi is free (Open Source) and in addition to the operating system, which is very similar to Windows on a PC, there are add-ons available that provide very comprehensive solutions for boaters. I chose OpenPlotter, the interface seemed relatively clean, and I found it slightly faster to boot than the other version on my shortlist. The people that use these systems are passionate about boats and opensource technology and the internet communities are incredibly supportive.

With a Rasberry Pi now at the centre of the boat a whole range of opportunities for electronic wizardry opened up. 

The first was to improve the monitoring of the engine. To this end following a couple of YouTube channels I was able to build and install a device which measures temperature and humidity of the engine bay, and the temperature of the exhaust manifold, the exhaust, engine oil and alternator. It also measures engine RPM. It then sends the information using wi-fi to the Raspberry Pi which presents the information either on my mobile phone or to my tablet, which I use as a Chart Plotter.

Krishna has two batteries, one to start the engine and one to run everything else (lights, navigation equipment). The starter battery is a traditional lead acid battery, and the leisure battery is a Lithium-Ion Phosphate (LiFePo4) battery. Monitoring the state of these batteries was not the best. One of the good things about a Lead Acid battery is it will run flat and consequently give you plenty of warning as lights dim or machinery behaves erratically. With LiFePo4 batteries when the charge drops to a certain level they shut down. On one occasion, whilst sailing single handed, the battery shutdown whilst the tiller pilot was in the middle of tacking! So, it made sense to build two battery monitors which capture the voltage, state of charge, current in and out. As with the engine monitor this information is sent over Wi-Fi to the Rasberry Pi and presented in a dashboard.

I was also interested in capturing the information that my NASA Marine Speed and Depth produces. This was probably the most challenging piece of work. I was determined not to replace any of the existing boat equipment after all it worked perfectly, but interfacing with the NASA Speed and Depth was a real challenge. This unit has no communication interface, however someone very talented people worked out that attaching wires to the output of the LED Display Driver chip inside the unit would allow the signals to be captured and converted in to NMEA2000 messages which can be received by the Raspberry Pi and displayed in the chart plotter interface. Getting this wrong though had the potential to kill the unit.

The latest piece of work involves monitoring the contents of the fuel and water tanks. Now if I want to know how much fuel I have I need to put a dipstick in to the fuel filler cap. The water tank has a pipe on the outside of the tank which provides an indication of the level. Neither are particularly convenient if its raining for example or if there's a lack of light in near the water tank. To this end I discovered some projects done by others on older software versions. By this time, I was becoming a little more comfortable with the development language that is used in these environments and was able to upgrade them at get them to work. These sensors are glued to the underside of the tank, they send an ultrasonic pulse to the surface of the fluid in the tank, which is reflected back to the sensor. The sensor measures the time for the pulse to return and from that calculates the height in millimetres of the fuel in the tank. Given the tank is a cube, the volume of liquid in the tank can be calculated. This is then sent to the Rasberry PI, which presents this information in Water and Fuel level gauges.


