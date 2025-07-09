import { useState, useEffect } from "react";
import mqtt from "mqtt";
import "./App.css";
import amrImage from "./AMR_Image.png";
import designReport from "./design_report.pdf";
import userManual from "./user_manual.pdf";
import backgroundImage from "./background.png";
import referenceDesign from "./referenceDesign.pdf";

// MQTT broker configuration
const MQTT_BROKER_URL = "ws://test.mosquitto.org:8081"; // Change to your MQTT broker URL
const MQTT_STATE_TOPIC = "amr/state";
const MQTT_X_AXIS_TOPIC = "amr/coordinates/x-axis";
const MQTT_Y_AXIS_TOPIC = "amr/coordinates/y-axis";
const MQTT_IMAGE_TOPIC = "amr/map/image";

interface ImageMetadata {
  totalChunks: number;
  totalSize: number;
  currentChunk: number;
}

const App: React.FC = () => {
  const [isShrunk, setIsShrunk] = useState(false);
  const [coordinates, setCoordinates] = useState({
    x: 0,
    y: 0,
  });
  const [targetPosition, setTargetPosition] = useState("");
  const [client, setClient] = useState<mqtt.MqttClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [receivedImage, setReceivedImage] = useState<string | null>(null);
  const [imageProgress, setImageProgress] = useState(0);
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(
    null
  );
  const [chunksReceived, setChunksReceived] = useState<Record<number, string>>(
    {}
  );

  // Initialize MQTT connection
  useEffect(() => {
    const mqttClient = mqtt.connect(MQTT_BROKER_URL);

    mqttClient.on("connect", () => {
      setIsConnected(true);
      mqttClient.subscribe(MQTT_STATE_TOPIC);
      mqttClient.subscribe(MQTT_X_AXIS_TOPIC);
      mqttClient.subscribe(MQTT_Y_AXIS_TOPIC);
      mqttClient.subscribe(MQTT_IMAGE_TOPIC, { qos: 1 });
      console.log("Connected to MQTT broker");
    });

    mqttClient.on("message", (topic, message) => {
      const payload = message.toString();

      if (topic === MQTT_IMAGE_TOPIC) {
        try {
          // Parse the message (format: "CHUNK:currentChunk:totalChunks:totalSize:base64Data")
          const [
            prefix,
            currentChunkStr,
            totalChunksStr,
            totalSizeStr,
            ...rest
          ] = payload.split(":");
          const base64Data = rest.join(":"); // In case there are colons in the base64 data

          const currentChunk = parseInt(currentChunkStr);
          const totalChunks = parseInt(totalChunksStr);
          const totalSize = parseInt(totalSizeStr);

          // Update metadata if not set or if changed
          if (
            !imageMetadata ||
            imageMetadata.totalChunks !== totalChunks ||
            imageMetadata.totalSize !== totalSize
          ) {
            setImageMetadata({
              totalChunks,
              totalSize,
              currentChunk: 0,
            });
            setChunksReceived({});
          }

          // Store the chunk
          setChunksReceived((prev) => ({
            ...prev,
            [currentChunk]: base64Data,
          }));

          // Update progress
          const receivedCount = Object.keys(chunksReceived).length + 1;
          setImageProgress(Math.round((receivedCount / totalChunks) * 100));
        } catch (error) {
          console.error("Error processing image chunk:", error);
        }
      }
    });

    mqttClient.on("error", (err) => {
      console.error("MQTT error:", err);
    });

    mqttClient.on("close", () => {
      setIsConnected(false);
      console.log("Disconnected from MQTT broker");
    });

    setClient(mqttClient);

    return () => {
      if (mqttClient) {
        mqttClient.end();
      }
    };
  }, []);

  // Check if all chunks have been received and assemble the image
  useEffect(() => {
    if (
      imageMetadata &&
      Object.keys(chunksReceived).length === imageMetadata.totalChunks
    ) {
      // Sort chunks by their index and concatenate the base64 strings
      const sortedChunks = Object.entries(chunksReceived)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([_, data]) => data)
        .join("");

      // Create the image URL
      const imageUrl = `data:image/png;base64,${sortedChunks}`;
      setReceivedImage(imageUrl);
      setImageProgress(100);

      // Reset for next image
      setTimeout(() => {
        setImageMetadata(null);
        setChunksReceived({});
        setImageProgress(0);
      }, 3000);
    }
  }, [chunksReceived, imageMetadata]);

  // Shrink header whenever the user scrolls down (and expand at top)
  useEffect(() => {
    const handleScroll = () => {
      setIsShrunk(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    // initialize state in case page isn't at top
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleImageClick = () => {
    window.open(designReport, "_blank");
  };

  const handleImageClick2 = () => {
    window.open(userManual, "_blank");
  };

  const handleImageClick3 = () => {
    window.open(referenceDesign, "_blank");
  };

  const handleCoordinateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCoordinates((prev) => ({
      ...prev,
      [name]: Number(value),
    }));
  };

  const handleSetPosition = () => {
    setTargetPosition(`Target: (${coordinates.x}, ${coordinates.y})`);
    publishMessage(MQTT_STATE_TOPIC, "start");
    // Publish coordinates to their respective topics
    publishMessage(MQTT_X_AXIS_TOPIC, coordinates.x.toString());
    publishMessage(MQTT_Y_AXIS_TOPIC, coordinates.y.toString());
  };

  const handleStartMapping = () => {
    publishMessage(MQTT_STATE_TOPIC, "map");
  };

  const handleStop = () => {
    publishMessage(MQTT_STATE_TOPIC, "stop");
  };

  const publishMessage = (topic: string, message: string) => {
    if (client && isConnected) {
      client.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
          console.error(`Error publishing to ${topic}:`, err);
        } else {
          console.log(`Published to ${topic}: ${message}`);
        }
      });
    } else {
      console.warn("MQTT client not connected");
    }
  };

  return (
    <div
      className="App"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        minHeight: "100vh",
      }}
    >
      {/* Fixed header at top, shrinks when scrolled */}
      <header className={`top-strip ${isShrunk ? "small" : ""}`}>
        <button className="hanging-button" onClick={handleImageClick2}>
          User Manual
        </button>
        <button className="hanging-button2" onClick={handleImageClick}>
          Design Report
        </button>
        <h1 className="strip-title">AMR Control - Team 1</h1>
        <img
          src={amrImage}
          alt="ROBOT"
          className="strip-image"
          onClick={handleImageClick3}
          style={{ cursor: "pointer" }}
        />
      </header>

      {/* Main content below header */}
      <main className={`content ${isShrunk ? "small-padding" : ""}`}>
        <div className="image-controls-container">
          {/* Bottom image container */}
          <div className="bottom-image-container">
            {receivedImage ? (
              <img
                src={receivedImage}
                alt="Received Map"
                className="bottom-image"
              />
            ) : (
              <div className="image-placeholder">
                {imageProgress > 0 ? (
                  <>
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${imageProgress}%` }}
                      ></div>
                    </div>
                    <p>Receiving image: {imageProgress}%</p>
                  </>
                ) : (
                  <p>No map image received yet</p>
                )}
              </div>
            )}
            {targetPosition && (
              <div className="coordinates-display">{targetPosition}</div>
            )}
          </div>

          {/* Controls section */}
          <div className="controls-section">
            <h3>AMR Controls</h3>
            <div className="control-buttons">
              <button className="control-button1" onClick={handleStartMapping}>
                Start Mapping
              </button>

              <div className="coordinate-controls">
                <div className="input-group">
                  <label>X Coordinate:</label>
                  <input
                    type="number"
                    name="x"
                    value={coordinates.x}
                    onChange={handleCoordinateChange}
                    className="coord-input"
                  />
                </div>

                <div className="input-group">
                  <label>Y Coordinate:</label>
                  <input
                    type="number"
                    name="y"
                    value={coordinates.y}
                    onChange={handleCoordinateChange}
                    className="coord-input"
                  />
                </div>

                <button className="control-button2" onClick={handleSetPosition}>
                  Start
                </button>

                <button className="control-button3" onClick={handleStop}>
                  Stop
                </button>
              </div>
            </div>
            <div className="connection-status">
              MQTT Status: {isConnected ? "Connected" : "Disconnected"}
            </div>
          </div>
        </div>

        {/* Filler to enable scrolling */}
        <div style={{ height: "60vh" }} />
      </main>
    </div>
  );
};

export default App;
