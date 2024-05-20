// This file sets up a server using Express and configures various APIs and services like Sonos, Netatmo, and Tibber.
// Load the express module to create and manage the HTTP server.
// Load the cors middleware to enable CORS with various options.
// Load the request module to make HTTP calls to external services.
// Destructure exec from child_process module to run shell commands from Node.js.
// Load the default configuration from the sample file. This will be overridden if a custom config exists.

const fs = require("fs");
if (fs.existsSync("./config.js")) {
  // Check if a custom configuration file exists and load it, overriding the default configuration.
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

// Initialize the express application.
const server = app.listen(config.web.socket, function () {
  console.log("Server listening on port " + config.web.socket + ".");
});

// Discover Sonos devices in the network and set up event listeners for track, play state, and volume changes.
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
            // Emit the current track information to all connected clients via socket.io when the track changes.
            io.emit("SONOS_TRACK", track);
          });

          sonos.on("PlayState", (state) => {
            // Emit the play state to all connected clients when the Sonos play state changes.
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

const io = require("socket.io")(server);
io.set("origins", [
  "http://homeboard.local:8080",
  "http://localhost:8080",
  "http://192.168.68.134:8080",
]); //erik: temporarily set to static ip on macbook-pro
io.on("connection", function (socket) {
  // Log the socket ID for debugging purposes when a new client connects.
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
        // Log a message when a specific URI is being played on Sonos.
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
        // Log a message when a radio station is being played on Sonos.
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
        // Log the response from a mutation query to set the thermostat state in a formatted JSON string.
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
    // Log the JSON data containing weather information from Netatmo stations.
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
  // Test the motion sensor by configuring the screensaver to activate quickly.
  // Set the DISPLAY environment variable to :0, necessary for GUI operations from the command line.
  // Set the screensaver activation time to 2 seconds using the xset command.
  // Log the channel and the current value of the motion sensor, along with the total motion value.
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

// Define a function to set the lighting mode. This function is currently commented out and needs implementation.
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

// Load the version 3 of the node-hue-api module, which allows interaction with Philips Hue lights.
// 	, discovery = v3.discovery
// 	, hueApi = v3.api
// 	, GroupLightState = v3.lightStates.GroupLightState
// 	;
// Declare a variable to hold the authenticated Hue API instance.
// Perform a UPnP search to discover Hue Bridges on the local network and connect to them.
// 	if (discoveryResults.length === 0) {
// 		console.error('Failed to resolve any Hue Bridges');
// 		const ipAddress = null;
// 	} else {
// 		// Ignore the possibility of multiple Hue Bridges being present, as it is a rare scenario.
// 		const ipAddress = discoveryResults[0].ipaddress;

// 		hueApi.createLocal(ipAddress).connect(config.hue.username).then(authenticatedApi => {
// 			light_api = authenticatedApi;
// 			// Retrieve the group information for 'Kitchen' from the Hue API.
// 			// 	const groupState = new GroupLightState()
// 			// 		.on()
// 			// 		.brightness(70)
// 			// 		.saturation(80)
// 			// 		;
// 			// 	authenticatedApi.groups.setGroupState(group[0].id, groupState);
// 			// End of the function to retrieve and log all scenes.

// 			// Retrieve all groups from the Hue API and process them.
// 			// 	console.log(scenes)

// 			// End of the function to set the state of the 'Kitchen' group.

// 		})
// 	}
// Catch and log any errors that occur during the Hue API interaction.

// Load the Tibber API module to interact with the Tibber energy service.
// Create a new TibberQuery instance for interacting with the Tibber API using the first configuration set.
// Create a second TibberQuery instance for interacting with the Tibber API using the second configuration set.

// Define the path to the directory that will be served by the web server.
if (fs.existsSync(webpath)) {
  // Load the connect module to use middleware in the HTTP server.
  // Load the serve-static middleware to serve static files.
  // Initialize the connect application.
    // Use the serve-static middleware to serve files from the specified path.
    // Start the server listening on the configured port.
      // Log a message indicating that the server is running and on which port.
    });
}
