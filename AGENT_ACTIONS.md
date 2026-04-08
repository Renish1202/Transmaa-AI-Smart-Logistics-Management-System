# Agentic AI Actions (Transmaa)

This list defines the tools the AI agent is allowed to use, and whether the action is safe (no side-effects) or risky (side-effects require confirmation).

## Safe Actions (no confirmation)
- get_recent_rides
  - Inputs: none
  - Output: last 5 rides for the current user/driver/admin
- get_ride_status
  - Inputs: ride_id
  - Output: status and route details for a specific ride (must belong to user/driver or admin)
- get_driver_status
  - Inputs: none
  - Output: driver verification status for current driver

## Risky Actions (require confirmation)
- request_ride
  - Inputs: pickup_location, drop_location, load_weight
  - Effect: creates a new ride request
- cancel_ride
  - Inputs: ride_id
  - Effect: cancels a ride (only if status is requested/accepted)

## Notes
- The agent must enforce role permissions inside each tool.
- The agent must ask for confirmation before executing risky actions.
- If required inputs are missing, the agent must ask the user for them.
