#!/bin/bash

# URL to download the JSONL file from (without the lsn parameter)
BASE_URL="http://localhost:3000/shape/issues"

# Directory to store individual JSON files
OUTPUT_DIR="./json_files"

# Initialize the latest lsn variable
LATEST_LSN="-1"

# Create the output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Function to download and process JSONL data
process_jsonl() {
    local url="$1"
    local output_file="$2"
    
    echo "Downloading JSONL file from $url..."
    curl -o "$output_file" "$url"

    # Check if the file was downloaded successfully
    if [ ! -f "$output_file" ]; then
        echo "Failed to download the JSONL file."
        exit 1
    fi

    # Check if the file is not empty
    if [ ! -s "$output_file" ]; then
        echo "The downloaded JSONL file is empty."
        return
    fi

    echo "Successfully downloaded the JSONL file."

    # Ensure the file ends with a newline
    if [ -n "$(tail -c 1 "$output_file")" ]; then
        echo >> "$output_file"
    fi

    # Read the JSONL file line by line and save each JSON object to an individual file
    while IFS= read -r line || [ -n "$line" ]; do
        echo "Processing line: $line"  # Log the line being processed

        type=$(echo "$line" | jq -r '.type')
        if [ "$type" != "data" ]; then
            echo "Skipping line with type: $type"  # Log skipping non-data objects
            continue
        fi

        id=$(echo "$line" | jq -r '.data.id')
        lsn=$(echo "$line" | jq -r '.lsn')

        if [ -z "$id" ]; then
            echo "No ID found in line: $line"  # Log if no ID is found
        else
            echo "Extracted ID: $id"  # Log the extracted ID
            echo "$line" | jq . > "$OUTPUT_DIR/json_object_$id.json"
            echo "Written to file: $OUTPUT_DIR/json_object_$id.json"  # Log file creation

            LATEST_LSN="$lsn"
            echo "Updated latest LSN to: $LATEST_LSN"
        fi
    done < "$output_file"
}

# Main loop to poll for updates every second
while true; do
    url="$BASE_URL?lsn=$LATEST_LSN"

    process_jsonl "$url" "file.jsonl"

    sleep 1
done

