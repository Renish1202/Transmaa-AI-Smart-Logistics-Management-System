# Transmaa Support Knowledge Base

This file is the starter knowledge base for the RAG chatbot. Add or edit
markdown or text files in this folder to expand what the assistant can answer.

## Rides
- Users can request rides by providing pickup location, drop location, and load weight.
- Ride statuses follow this flow: requested -> accepted -> started -> in_transit -> delivered -> completed.
- A ride can be cancelled only when it is in the requested or accepted status.
- Drivers can view pending rides and accept them if they are verified and the load does not exceed their capacity.

## Drivers
- Driver registration requires DL number, PAN number, vehicle number, vehicle type, capacity in tons,
  and uploads for DL, RC, and vehicle images.
- New registrations are marked as pending until admin verification is complete.
- If a driver was rejected, they can re-register and the status returns to pending.

## Common Messages
- "Ride not found" can mean the ride id is incorrect or does not belong to the current user/driver.
- "Only users can request rides" means the account role must be user.
- "Only drivers can accept rides" means the account role must be driver and verified.

## When To Contact Support
- Use support when you need account changes, verification help, or a policy decision that is not in the knowledge base.
