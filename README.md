# Tempmon
A simple application to provide temperature, humidity and atmospheric pressure information\
using a [BME280 sensor](https://www.embeddedadventures.com/datasheets/BME280.pdf) (I use it with a Raspberry Pi) with live data and a 48 hour history graph.

#
This app is currently NOT designed to use multiple sensors but I may add this functionality later.\
(When my lazy self sets up and outdoor sensor) For now it gets outdoor data [OpenWeatherMap API](https://openweathermap.org/api).

**There is no built in security!**\
I use [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/) and [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/) to access it outside from my home network (It's FREE)

#
The example frontend is in SLOVAK language and I don't plan to translate it.
