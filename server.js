// This file sets up a server using Express and integrates various APIs and services like Sonos, Netatmo, and Yahoo Finance.
// Load the express module to create an instance of an Express application.
// Load the cors middleware to enable CORS with various options.
// Load the request module to make HTTP calls to external services.
// Destructure exec from child_process module to run shell commands from Node.js.
// Load the default configuration from the sample config file.

const fs = require("fs");
if (fs.existsSync("./config.js")) {
  // Check if a custom configuration file exists and load it if present.
  config = require("./config");
}

// Load the Sonos module to interact with Sonos speakers.
var sonos = null;

// Load the netatmo module to interact with Netatmo devices.
var netatmoapi = null;
if (config.netatmo.client_id) {
  netatmoapi = new netatmo(config.netatmo);
}

// Load the yahoo-finance module to fetch financial data.
// Load the NewsAPI module to fetch news articles.
var newsapi = null;
if (config.newsapi.key) {
  newsapi = new NewsAPI(config.newsapi.key);
}

// Load the node-ical module to parse iCalendar data.
// Load the moment-timezone module to manipulate and display dates and times in different timezones.

// Create an Express application instance.
// Start the server listening on the port specified in the configuration. Log a message to the console when the server is ready.

// Discover Sonos devices in the network and set up event listeners for various Sonos events like track change, play state change, and volume change.
Sonos.DeviceDiscovery().once("DeviceAvailable", (device) => {
  sonos = new Sonos.Sonos(device.host);
  sonos
    .getAllGroups()
    .then((groups) => {
      groups.forEach((group) => {
        if (
          group.Name.substring(0, config.sonos.group.length) ==
          config.sonos.group
        ) {
          sonos = new Sonos.Sonos(group.host);
          sonos.setSpotifyRegion(config.sonos.region);

          sonos.on("CurrentTrack", (track) => {
            // Log the current track information from Sonos (commented out).
            io.emit("SONOS_TRACK", track);
          });

          sonos.on("PlayState", (state) => {
            // Log the play state changes from Sonos (commented out).
            io.emit("SONOS_STATE", state);
          });
          sonos.on("Volume", (volume) => {
            io.emit("SONOS_VOLUME", volume);
          });
        }
      });
    })
    .catch((err) => {
      console.warn("Error loading topology %s", err);
    });
});

// Load and initialize socket.io with the server instance to enable real-time bidirectional event-based communication.
io.set("origins", [
  "http://homeboard.local:8080",
  "http://localhost:8080",
  "http://192.168.68.134:8080",
]); // Set allowed origins for socket.io connections. This is a temporary setup for specific IPs.
io.on("connection", function (socket) {
  // Log the socket ID for debugging purposes (commented out).
  if (sonos) {
    sonos.currentTrack().then((track) => {
      io.emit("SONOS_TRACK", track);
    });
    sonos.getCurrentState().then((state) => {
      io.emit("SONOS_STATE", state);
    });
    sonos.getVolume().then((volume) => {
      io.emit("SONOS_VOLUME", volume);
    });
  }
  socket.on("quotes", function (symbols) {
    yahooFinance.quote(
      {
        symbols: symbols,
        modules: ["price"],
      },
      function (err, quotes) {
        io.emit("QUOTES", quotes);
      }
    );
  });
  socket.on("news", function () {
    if (newsapi) {
      newsapi.v2.topHeadlines(config.newsapi.headlines).then((response) => {
        let articles = response.articles.filter(function (el) {
          let keeparticle = true;
          config.newsapi.exclude.forEach(function (word) {
            if (el.title.toLowerCase().indexOf(word) > -1) {
              keeparticle = false;
              return;
            }
          });
          return keeparticle;
        });
        io.emit("NEWS", articles);
      });
    }
  });
  socket.on("config", function () {
    console.log("Send config");
    if (config.netatmo.forecast.device_id) {
      getWeatherToken(function () {
        io.emit("CONFIG", config);
      });
    } else {
      io.emit("CONFIG", config);
    }
  });

  socket.on("weather", function () {
    if (netatmoapi) {
      netatmoapi.getStationsData(
        config.netatmo.options,
        function (err, devices) {}
      );
    }
  });
  socket.on("restart", function () {
    console.log("Restart display manager");
    // exec('sudo systemctl restart display-manager', (error, stdout, stderr) => {
    exec("pm2 restart server", (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);
    });
  });
  socket.on("reboot", function () {
    console.log("Rebooting device");
    require("reboot").reboot();
  });
  socket.on("sleep", function () {
    console.log("Sleep screen");
    // exec('/usr/bin/tvservice -p', (error, stdout, stderr) => {
    exec(
      "export DISPLAY=:0; sleep 1; xset -display :0.0 s activate; /usr/bin/tvservice -p",
      (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
      }
    );
  });
  socket.on("wakeup", function () {
    console.log("Wakeup screen");
    exec(
      "export DISPLAY=:0; xset -display :0.0 s off; xset -display :0.0 dpms force on; xset -display :0.0 -dpms",
      (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
        }
      }
    );
  });
  socket.on("playpause", function (uri) {
    sonos
      .togglePlayback()
      .then((result) => {
        console.log("Started playing %j", result);
      })
      .catch((err) => {
        console.log("Error occurred %s", err);
      });
  });
  socket.on("playnext", function (uri) {
    sonos
      .next()
      .then((result) => {
        console.log("Started next %j", result);
      })
      .catch((err) => {
        console.log("Error occurred %s", err);
      });
  });
  socket.on("playshuffle", function () {
    console.log("Set playmode shuffle");
    sonos
      .setPlayMode("SHUFFLE")
      .then((success) => {
        console.log("Changed playmode success");
      })
      .catch((err) => {
        console.log("Error occurred %s", err);
      });
  });
  socket.on("volumedown", function () {
    sonos.adjustVolume(-1);
  });
  socket.on("volumeup", function () {
    sonos.adjustVolume(1);
  });
  socket.on("gettrack", function () {
    sonos.currentTrack().then((track) => {
      io.emit("SONOS_TRACK", track);
    });
  });
  socket.on("playURI", function (uri) {
    console.log("Play sonos uri ", uri);
    sonos.selectQueue();
    sonos.flush();
    sonos.setPlayMode("SHUFFLE");
    sonos
      .play(uri)
      .then((success) => {
        // Log when a URI is being played on Sonos (commented out).
      })
      .catch((err) => {
        console.log("Error occurred %j", err);
      });
  });
  socket.on("playRadio", function (station) {
    console.log("Play sonos radio ", station);
    sonos
      .playTuneinRadio(station[0], station[1])
      .then((success) => {
        // Log when a radio station is being played on Sonos (commented out).
      })
      .catch((err) => {
        console.log("Error occurred %j", err);
      });
  });
  socket.on("setLights", function (mode) {
    console.log("Set lights ", mode);
    setLights(mode);
  });
  socket.on("calendar", function () {
    var calevents = [];
    if (config.calendar.shared.url) {
      ical.async.fromURL(config.calendar.shared.url).then((parsedCal) => {
        const events = Object.values(parsedCal).filter(
          (el) => el.type === config.calendar.shared.type
        );
        for (const event of events) {
          const { start, summary } = event;
          const startDate = moment(start).utc().toDate();
          const diff = moment(startDate).diff(new Date(), "days");
          if (diff >= 0 && diff < config.calendar.shared.days) {
            calevents.push(event);
          }
        }
        //Fetch holiday calendar
        ical.async.fromURL(config.calendar.holiday.url).then((parsedCal) => {
          const events = Object.values(parsedCal).filter(
            (el) => el.type === config.calendar.holiday.type
          );
          for (const event of events) {
            const { start, summary } = event;
            const startDate = moment(start).utc().toDate();
            const diff = moment(startDate).diff(new Date(), "days");
            if ("val" in event.summary) {
              event.summary = event.summary.val;
            }
            if (diff >= 0 && diff < config.calendar.holiday.days) {
              calevents.push(event);
            }
          }

          calevents.sort(
            (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
          );
          calevents = calevents.slice(0, 7);
          console.log("Calendar update");
          io.emit("CALENDAR", calevents);
        });
      });
    } else if (config.calendar.holiday.url) {
      //Fetch holiday calendar
      ical.async.fromURL(config.calendar.holiday.url).then((parsedCal) => {
        const events = Object.values(parsedCal).filter(
          (el) => el.type === config.calendar.holiday.type
        );
        for (const event of events) {
          const { start, summary } = event;
          const startDate = moment(start).utc().toDate();
          const diff = moment(startDate).diff(new Date(), "days");
          console.log(diff, startDate);
          if ("val" in event.summary) {
            event.summary = event.summary.val;
          }
          if (diff >= 0 && diff < config.calendar.holiday.days) {
            calevents.push(event);
          }
        }

        calevents.sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
        );
        calevents = calevents.slice(0, 7);
        io.emit("CALENDAR", calevents);
      });
    }
  });

  socket.on("tibber", function (mode) {
    if (tibberQuery) {
      tibberQuery
        .query(
          "query {viewer { homes {      currentSubscription{        id validFrom validTo status priceInfo{ current{ total energy tax startsAt currency level }}}}} }"
        )
        .then((res) => {
          if (res.viewer && res.viewer.homes) {
            io.emit("TIBBER", res.viewer.homes[0]);
          }
        });
    }
  });
  socket.on("tibber2", function (mode) {
    if (tibberQuery2) {
      tibberQuery2
        .query(
          '{me {home(id:"' +
            config.tibber2.homeId +
            '") {    thermostats { state{ comfortTemperature } temperatureSensor { measurement { value } } }    inverter(id:"' +
            config.tibber2.inverter +
            '") {bubble {  value  percent} }  inverterProduction (id:"' +
            config.tibber2.production +
            '"){keyFigures {  valueText  unitText  description} }    }}}'
        )
        .then((res) => {
          if (res.me) {
            io.emit("TIBBER2", res.me.home);
          }
        });
    }
  });
  socket.on("tibber3", function (mode) {
    if (tibberQuery2) {
      tibberQuery2
        .query(
          '{me {home(id:"' +
            config.tibber2.homeId +
            '") {    electricVehicles {battery {percent} isAlive imgUrl batteryText}    }}}'
        )
        .then((res) => {
          if (res.me) {
            io.emit("TIBBER3", res.me.home);
          }
        });
    }
  });
  socket.on("setthermo", function (temp) {
    console.log("Set thermostat ", temp);
    tibberQuery2
      .query(
        'mutation { me { home(id: "' +
          config.tibber2.homeId +
          '") { thermostat(id: "' +
          config.tibber2.thermostat +
          '") { setState(comfortTemperature: ' +
          temp +
          ") }    }  } }"
      )
      .then((res) => {
        // Log the response from setting the thermostat state (commented out).
      });
  });
});

// Get weather token
var getWeatherToken = function (callback) {
  // Fetch the public access token from Netatmo's weather map service.
  return request("https://weathermap.netatmo.com/", (err, res, body) => {
    if (err) {
      return console.log(err);
    }
    if (body.indexOf("accessToken") > -1) {
      let tokenplace = body.indexOf("accessToken");
      let tokenstart = body.indexOf('"', tokenplace) + 1;
      let tokenend = body.indexOf('"', tokenstart + 1);
      let access_token = body.substring(tokenstart, tokenend);
      console.log("Got weather token", access_token);
      config.netatmo.forecast.bearer = access_token;
      callback();
    } else {
      console.log("Could not get weather tokenstart");
      callback();
    }
  });
};

// Get weather station data
var getStationsData = function (err, devices) {
  devices.forEach(function (device) {
    console.log("Weather update");
    io.emit("WEATHER", parseStationData(device));
  });
};
var parseStationData = function (device) {
  var json_data = {};
  if (
    device.dashboard_data &&
    device.dashboard_data.hasOwnProperty("time_utc")
  ) {
    if (device.module_name == "Indoor" && device.dashboard_data) {
      json_data.indoor = device.dashboard_data;
    }
    device.modules.forEach(function (module) {
      if (module.module_name == "Outdoor" && module.dashboard_data) {
        json_data.outdoor = module.dashboard_data;
      }
    });
    // Log the JSON data for weather updates (commented out).
    return json_data;
  } else {
    console.log("Invalid weather data");
    console.log(device);
  }
};
if (netatmoapi) {
  netatmoapi.on("get-stationsdata", getStationsData);
}

// Motion sensor to enable screen
var gpio = require("rpi-gpio");
var last_motion_state = false;
var motion_value = 0;
gpio.on("change", function (channel, value) {
  // Test motion sensor functionality by adjusting the screensaver settings and logging the motion values (commented out).
  if (Math.abs(motion_value) > 10) {
    exec("export DISPLAY=:0 && xdotool mousemove 1 2");
    motion_value = 0;
  }
  if (value == true) {
    motion_value++;
  } else {
    motion_value--;
  }
  last_motion_state = value;
});
gpio.setup(11, gpio.DIR_IN, gpio.EDGE_BOTH);

// var setLights = function(mode){
// 	if (mode == 'tv'){

// 	}
// 	if (mode == 'dinner'){

// 	}
// 	if (mode == 'evening'){

// 	}
// 	if (mode == 'off'){

// 	}
// 	light_api.groups.getGroupByName('Kitchen').then(group => {
// 		const groupState = new GroupLightState()
// 			.on()
// 			.brightness(70)
// 			.saturation(80)
// 			;
// 		authenticatedApi.groups.setGroupState(group[0].id, groupState);
// 	})
// }

// const v3 = require('node-hue-api').v3
// 	, discovery = v3.discovery
// 	, hueApi = v3.api
// 	, GroupLightState = v3.lightStates.GroupLightState
// 	;
// var light_api;
// discovery.nupnpSearch().then(discoveryResults => {
// 	if (discoveryResults.length === 0) {
// 		console.error('Failed to resolve any Hue Bridges');
// 		const ipAddress = null;
// 	} else {
// 		// Ignoring that you could have more than one Hue Bridge on a network as this is unlikely in 99.9% of users situations
// 		const ipAddress = discoveryResults[0].ipaddress;

// 		hueApi.createLocal(ipAddress).connect(config.hue.username).then(authenticatedApi => {
// 			light_api = authenticatedApi;
// 			// light_api.groups.getGroupByName('Kitchen').then(group => {
// 			// 	const groupState = new GroupLightState()
// 			// 		.on()
// 			// 		.brightness(70)
// 			// 		.saturation(80)
// 			// 		;
// 			// 	authenticatedApi.groups.setGroupState(group[0].id, groupState);
// 			// })

// 			// authenticatedApi.groups.getAll().then(scenes => {
// 			// 	console.log(scenes)

// 			// })

// 		})
// 	}
// }).catch(err => { console.log('Hue error occurred %j', err) })

const Tibber = require("tibber-api");
const tibberQuery = new Tibber.TibberQuery(config.tibber1);
const tibberQuery2 = new Tibber.TibberQuery(config.tibber2);

let webpath = "www";
if (fs.existsSync(webpath)) {
  var connect = require("connect");
  var serveStatic = require("serve-static");
  connect()
    .use(serveStatic(webpath))
    .listen(config.web.port, function () {
      console.log("Server running on port " + config.web.port + "...");
    });
}
