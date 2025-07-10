import { useState, useEffect } from "react";
import mqtt from "mqtt";
import "./App.css";
import amrImage from "./AMR_Image.png";
import designReport from "./design_report.pdf";
import userManual from "./user_manual.pdf";
import backgroundImage from "./background.png";
import referenceDesign from "./referenceDesign.pdf";

// MQTT broker configuration
const MQTT_BROKER_URL = "ws://test.mosquitto.org:8081";
const MQTT_STATE_TOPIC = "amr/state";
const MQTT_X_AXIS_TOPIC = "amr/coordinates/x-axis";
const MQTT_Y_AXIS_TOPIC = "amr/coordinates/y-axis";
const MQTT_IMAGE_TOPIC = "amr/map/image";

interface ImageMetadata {
  totalChunks: number;
  totalSize: number;
  currentChunk: number;
}

interface ClickCoordinates {
  x: number;
  y: number;
}

const App: React.FC = () => {
  const [isShrunk, setIsShrunk] = useState(false);
  const [coordinates, setCoordinates] = useState({
    x: 0,
    y: 0,
  });
  const [clickCoords, setClickCoords] = useState<ClickCoordinates | null>(null);
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
          const [
            prefix,
            currentChunkStr,
            totalChunksStr,
            totalSizeStr,
            ...rest
          ] = payload.split(":");
          const base64Data = rest.join(":");

          const currentChunk = parseInt(currentChunkStr);
          const totalChunks = parseInt(totalChunksStr);
          const totalSize = parseInt(totalSizeStr);

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

          setChunksReceived((prev) => ({
            ...prev,
            [currentChunk]: base64Data,
          }));

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
      const sortedChunks = Object.entries(chunksReceived)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([_, data]) => data)
        .join("");

      const imageUrl = `data:image/png;base64,${sortedChunks}`;
      setReceivedImage(imageUrl);
      setImageProgress(100);

      setTimeout(() => {
        setImageMetadata(null);
        setChunksReceived({});
        setImageProgress(0);
      }, 3000);
    }
  }, [chunksReceived, imageMetadata]);

  // Shrink header whenever the user scrolls down
  useEffect(() => {
    const handleScroll = () => {
      setIsShrunk(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!receivedImage) {
      window.open(designReport, "_blank");
      return;
    }

    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();

    // Calculate click position relative to image center
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Calculate normalized coordinates (-1 to 1)
    const normalizedX = (clickX / rect.width) * 2 - 1;
    const normalizedY = 1 - (clickY / rect.height) * 2; // Invert Y axis

    // Convert to our coordinate system (-250 to 250)
    const coordX = Math.round(normalizedX * 250);
    const coordY = Math.round(normalizedY * 250);

    // Calculate real-world coordinates (each unit = 5cm)
    const realX = coordX * 5;
    const realY = coordY * 5;

    setClickCoords({ x: coordX, y: coordY });
    setCoordinates({ x: coordX, y: coordY });

    // Update the target position display
    setTargetPosition(
      `Target: (${coordX}, ${coordY}) [${realX}cm, ${realY}cm]`
    );
  };

  const handleImageClick2 = () => {
    window.open(userManual, "_blank");
  };

  const handleImageClick3 = () => {
    window.open(referenceDesign, "_blank");
  };

  const handleImageClick4 = () => {
    window.open(designReport, "_blank");
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
      <header className={`top-strip ${isShrunk ? "small" : ""}`}>
        <button className="hanging-button" onClick={handleImageClick2}>
          User Manual
        </button>
        <button className="hanging-button2" onClick={handleImageClick4}>
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

      <main className={`content ${isShrunk ? "small-padding" : ""}`}>
        <div className="image-controls-container">
          <div className="bottom-image-container">
            {receivedImage ? (
              <div style={{ position: "relative" }}>
                <img
                  src={receivedImage}
                  alt="Received Map"
                  className="bottom-image"
                  onClick={handleImageClick}
                  style={{ cursor: "crosshair" }}
                />
                {clickCoords && (
                  <div
                    className="coordinate-pointer"
                    style={{
                      left: `${((clickCoords.x + 250) / 500) * 100}%`,
                      top: `${((250 - clickCoords.y) / 500) * 100}%`,
                    }}
                  >
                    <div className="pointer-dot"></div>
                  </div>
                )}
              </div>
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
                    min="-250"
                    max="250"
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
                    min="-250"
                    max="250"
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

        <div style={{ height: "60vh" }} />
      </main>
    </div>
  );
};

export default App;
