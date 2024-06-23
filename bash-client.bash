#!/bin/bash

# URL to download the JSON file from (without the lsn parameter)
BASE_URL="http://localhost:3000/shape/todos"

# Directory to store individual JSON files
OUTPUT_DIR="./json_files"

# Initialize the latest lsn variable
LATEST_LSN="-1"

# Create the output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Function to download and process JSON data
process_json() {
    local url="$1"
    local output_file="$2"

    echo >&2 "Downloading JSON file from $url..."
    curl -s -o "$output_file" "$url"

    # Check if the file was downloaded successfully
    if [ ! -f "$output_file" ]; then
        echo >&2 "Failed to download the JSON file."
        exit 1
    fi

    # Check if the file is not empty
    if [ ! -s "$output_file" ]; then
        echo >&2 "The downloaded JSON file is empty."
        # Return the latest LSN
        echo "$LATEST_LSN"
        return
    fi

    echo >&2 "Successfully downloaded the JSON file."

    # Ensure the file ends with a newline
    if [ -n "$(tail -c 1 "$output_file")" ]; then
        echo >> "$output_file"
    fi

    # Validate the JSON structure (optional but recommended for debugging)
    if ! jq . "$output_file" > /dev/null 2>&1; then
        echo >&2 "Invalid JSON format in the downloaded file."
        exit 1
    fi

    # Read the JSON file line by line and save each JSON object to an individual file
    while IFS= read -r line; do
        # Check if the headers array contains an object with key "action"
        if echo "$line" | jq -e '.headers | map(select(.key == "action")) | length == 0' > /dev/null; then
            # echo "Skipping line without an action: $action"  # Log skipping non-data objects
            continue
        fi

        key=$(echo "$line" | jq -r '.key')
        lsn=$(echo "$line" | jq -r '.lsn')

        if [ -z "$key" ]; then
            echo >&2 "No key found in message: $line"  # Log if no ID is found
        else
            echo >&2 "Extracted key: $key"  # Log the extracted key
            echo "$line" | jq . > "$OUTPUT_DIR/json_object_$key.json"
            echo >&2 "Written to file: $OUTPUT_DIR/json_object_$key.json"  # Log file creation

            LATEST_LSN="$lsn"
            echo >&2 "Updated latest LSN to: $LATEST_LSN"
        fi
    done < <(jq -c '.[]' "$output_file") 

    echo >&2 "done with jq/read loop $LATEST_LSN"

    # Return the latest LSN
    echo "$LATEST_LSN"
}

# Main loop to poll for updates every second
while true; do
    url="$BASE_URL?lsn=$LATEST_LSN"
    echo $url

    LATEST_LSN=$(process_json "$url" "shape-data.json")

    sleep 1
done

