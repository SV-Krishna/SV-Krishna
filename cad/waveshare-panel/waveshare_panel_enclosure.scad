/*
 * Waveshare ESP32-S3 7-inch boat-panel enclosure
 * Parametric prototype based on Dimensioned 3D-Printed Enclosure
 * Specification v0.1.
 *
 * All dimensions are millimetres. The baseline is provisional: measure the
 * actual display, sensors, connectors and cabin panel before final printing.
 *
 * CLI example:
 *   openscad -o bezel.stl -D 'part="bezel"' waveshare_panel_enclosure.scad
 */

part = "assembly"; // [assembly,design_review_layout,bezel,carrier,rear_box,service_cover,box_interface_coupon,radar_clip,bme_pod,bme_cover,dimension_gauge,bezel_corner,radar_test]
$fn = 48;
eps = 0.02;

// Display baseline
display_glass_w = 192.96;
display_glass_h = 110.76;
active_display_w = 154.88;
active_display_h = 86.72;
rear_plate_w = 165.72;
rear_plate_h = 97.60;
display_hole_dx = 126.20;
display_hole_dy = 65.65;

// Front and panel
// 212 mm preserves 21 mm overlap per side around the 170 mm panel cut-out
// while adding useful clearance on the Ender-3 V3 SE's 220 mm bed.
bezel_w = 212;
bezel_h = 142;
bezel_t = 3.0;
bezel_r = 7;
display_recess_w = 194.0;
display_recess_h = 111.8;
display_recess_depth = 1.7;
visible_opening_w = 156.0;
visible_opening_h = 88.0;
panel_cutout_w = 170;
panel_cutout_h = 102;
panel_corner_r = 4;
gasket_groove_w = 3.0;
gasket_groove_depth = 1.1;
gasket_outer_w = 204;
gasket_outer_h = 130;
radar_window_t = 1.5;

// Fasteners and carrier
m3_clearance = 3.4;
m3_insert_d = 4.6; // tune for the selected heat-set insert
carrier_w = 184;
carrier_h = 120;
carrier_t = 4;
carrier_r = 5;
carrier_frame_w = 12;
display_standoff_h = 8;
display_pad_d = 10;
clamp_inset_x = 9;
clamp_inset_y = 8;

// Rear enclosure
rear_box_w = 168;
rear_box_h = 100;
rear_internal_depth = 35;
rear_wall = 2.7;
rear_floor = 3;
rear_box_r = 4;
cover_t = 2.5;
cover_clearance = 0.4;
cover_screw_inset = 7;
cable_entry_w = 8;
cable_entry_h = 7;
// Four towers keep the rear-box floor clear of the display and positively
// locate it with short spigots in matching floor counterbores. M3 screws are
// inserted from inside the open box into heat-set inserts in the towers.
box_mount_dx = 136;
box_mount_dy = 80;
box_mount_tower_d = 10;
box_mount_height = carrier_t + display_standoff_h;
box_register_d = 8;
box_register_h = 1.5;
box_register_clearance = 0.25; // radial clearance; validate with coupon
box_insert_depth = 5;

// Interface PCB placeholder
interface_pcb_w = 70;
interface_pcb_h = 40;
pcb_hole_dx = 60;
pcb_hole_dy = 30;
pcb_standoff_d = 8;
pcb_standoff_h = 10;

// LD2410C pocket/clip
radar_w = 40;
radar_h = 20;
radar_d = 11;
radar_clearance = 0.35;
radar_clip_t = 2;

// BME280 pod
bme_w = 34;
bme_h = 34;
bme_d = 15;
bme_wall = 2;
bme_pocket_w = 21;
bme_pocket_h = 21;
bme_pocket_d = 7;
bme_slot_w = 1.8;
bme_cover_t = 2;

module rounded_rect_2d(size, r) {
    offset(r=r) offset(delta=-r) square(size, center=true);
}

module rounded_plate(size, r, h) {
    linear_extrude(height=h) rounded_rect_2d(size, r);
}

module rounded_ring(outer, inner, r, h) {
    linear_extrude(height=h)
        difference() {
            rounded_rect_2d(outer, r);
            rounded_rect_2d(inner, max(0.5, r-2));
        }
}

module clamp_positions() {
    for (p = [
        [-carrier_w/3, -carrier_h/2+clamp_inset_y],
        [ carrier_w/3, -carrier_h/2+clamp_inset_y],
        [-carrier_w/3,  carrier_h/2-clamp_inset_y],
        [ carrier_w/3,  carrier_h/2-clamp_inset_y],
        [-carrier_w/2+clamp_inset_x, 0],
        [ carrier_w/2-clamp_inset_x, 0]
    ]) translate(p) children();
}

module display_mount_positions() {
    for (x=[-display_hole_dx/2, display_hole_dx/2])
        for (y=[-display_hole_dy/2, display_hole_dy/2])
            translate([x,y]) children();
}

module cover_screw_positions() {
    for (x=[-rear_box_w/2+cover_screw_inset, rear_box_w/2-cover_screw_inset])
        for (y=[-rear_box_h/2+cover_screw_inset, rear_box_h/2-cover_screw_inset])
            translate([x,y]) children();
}

module box_mount_positions() {
    for (x=[-box_mount_dx/2,box_mount_dx/2])
        for (y=[-box_mount_dy/2,box_mount_dy/2])
            translate([x,y]) children();
}

module gasket_groove_cut() {
    translate([0,0,bezel_t-gasket_groove_depth])
        linear_extrude(height=gasket_groove_depth+eps)
            difference() {
                rounded_rect_2d([gasket_outer_w,gasket_outer_h], 5);
                rounded_rect_2d([
                    gasket_outer_w-2*gasket_groove_w,
                    gasket_outer_h-2*gasket_groove_w
                ], 3);
            }
}

module bezel() {
    difference() {
        rounded_plate([bezel_w,bezel_h], bezel_r, bezel_t);
        // Visible opening passes through.
        translate([0,4,-eps])
            rounded_plate([visible_opening_w,visible_opening_h], 2, bezel_t+2*eps);
        // Glass recess is cut from the cabin-panel/rear face.
        translate([0,4,bezel_t-display_recess_depth])
            rounded_plate([display_recess_w,display_recess_h], 3,
                          display_recess_depth+eps);
        gasket_groove_cut();
        // Six blind insert pilots, open from the rear.
        clamp_positions()
            translate([0,0,bezel_t-2.2])
                cylinder(d=m3_insert_d, h=2.2+eps);
        // Radar pocket: leaves the specified 1.5 mm front wall.
        // This pocket is open from the rear, rather than being a trapped
        // internal void. Its lower face is the 1.5 mm radar window.
        translate([-(radar_w+2)/2,
                   -bezel_h/2+13-(radar_h+1)/2,
                   radar_window_t])
            cube([radar_w+2,radar_h+1,
                  bezel_t-radar_window_t+eps]);
    }
}

module carrier() {
    union() {
        difference() {
            union() {
                rounded_ring([carrier_w,carrier_h],
                             [rear_plate_w-10,rear_plate_h-10],
                             carrier_r, carrier_t);
                // Two rails connect the otherwise inboard display pads to
                // the perimeter frame without supporting the glass.
                for (y=[-display_hole_dy/2,display_hole_dy/2])
                    translate([0,y,carrier_t/2])
                        cube([carrier_w-2*carrier_frame_w,8,carrier_t],
                             center=true);
                // Short side bridges tie the four box towers into the
                // perimeter frame; the tower centres sit inside its opening.
                for (sx=[-1,1])
                    for (y=[-box_mount_dy/2,box_mount_dy/2])
                        translate([sx*(box_mount_dx/4+carrier_w/4),
                                   y,carrier_t/2])
                            cube([(carrier_w-box_mount_dx)/2,
                                  box_mount_tower_d,carrier_t],
                                 center=true);
            }
            clamp_positions()
                translate([0,0,-eps])
                    cylinder(d=m3_clearance, h=carrier_t+2*eps);
            display_mount_positions()
                translate([0,0,-eps])
                    cylinder(d=m3_clearance, h=carrier_t+2*eps);
        }
        // Display pads project rearward; holes continue through them.
        difference() {
            display_mount_positions()
                cylinder(d=display_pad_d, h=carrier_t+display_standoff_h);
            display_mount_positions()
                translate([0,0,-eps])
                    cylinder(d=m3_clearance,
                             h=carrier_t+display_standoff_h+2*eps);
        }
        // Rear-box attachment towers are outside the provisional display PCB
        // and its four mounting pads. Their top spigots register the box;
        // short M3 heat-set inserts are installed from the rear.
        difference() {
            box_mount_positions()
                cylinder(d=box_mount_tower_d, h=box_mount_height);
            box_mount_positions()
                translate([0,0,box_mount_height-box_insert_depth])
                    cylinder(d=m3_insert_d,
                             h=box_insert_depth+eps);
        }
        box_mount_positions()
            translate([0,0,box_mount_height-eps])
                difference() {
                    cylinder(d=box_register_d, h=box_register_h+eps);
                    translate([0,0,-eps])
                        cylinder(d=m3_insert_d,
                                 h=box_register_h+2*eps);
                }
    }
}

module rear_box() {
    total_d = rear_internal_depth + rear_floor;
    difference() {
        union() {
            // Front floor and perimeter shell.
            rounded_plate([rear_box_w,rear_box_h], rear_box_r, total_d);
            // Cover insert bosses at the open rear.
            cover_screw_positions()
                cylinder(d=9, h=total_d);
        }
        // Open cavity, leaving front floor and side walls.
        translate([0,0,rear_floor])
            rounded_plate([rear_box_w-2*rear_wall,
                           rear_box_h-2*rear_wall],
                          max(1,rear_box_r-rear_wall),
                          rear_internal_depth+eps);
        // Heat-set insert holes open at the rear.
        cover_screw_positions()
            translate([0,0,total_d-7])
                cylinder(d=m3_insert_d, h=7+eps);
        // Accessible M3 screws pass through the floor into carrier inserts.
        box_mount_positions()
            translate([0,0,-eps])
                cylinder(d=m3_clearance, h=rear_floor+2*eps);
        // Close-fit counterbores receive the carrier tower spigots and locate
        // the box in X/Y without changing its panel pass-through envelope.
        box_mount_positions()
            translate([0,0,-eps])
                cylinder(d=box_register_d+2*box_register_clearance,
                         h=box_register_h+eps);
        // Downward-facing cable entry through lower wall.
        translate([0,-rear_box_h/2,-eps])
            cube([cable_entry_w,rear_wall+2*eps,cable_entry_h],
                 center=false);
    }
    // 70 x 40 mm interface PCB standoffs.
    for (x=[-pcb_hole_dx/2,pcb_hole_dx/2])
        for (y=[-pcb_hole_dy/2,pcb_hole_dy/2])
            translate([x,y,rear_floor])
                difference() {
                    cylinder(d=pcb_standoff_d,h=pcb_standoff_h);
                    cylinder(d=2.9,h=pcb_standoff_h+eps);
                }
    // Cable-tie strain-relief bridge beside the lower cable entry.
    translate([-14,-rear_box_h/2+8,rear_floor])
        difference() {
            cube([28,8,6]);
            translate([3,-eps,2]) cube([22,8+2*eps,2.5]);
        }
}

module box_interface_coupon() {
    coupon_w = 28;
    coupon_h = 28;
    gap = 8;

    // Carrier-side tower coupon: printed upright, as on the carrier.
    translate([-(coupon_w+gap)/2,0,0])
        difference() {
            union() {
                rounded_plate([coupon_w,coupon_h],3,carrier_t);
                cylinder(d=box_mount_tower_d,h=box_mount_height+eps);
                translate([0,0,box_mount_height-eps])
                    cylinder(d=box_register_d,h=box_register_h+eps);
            }
            translate([0,0,box_mount_height-box_insert_depth])
                cylinder(d=m3_insert_d,
                         h=box_insert_depth+box_register_h+eps);
        }

    // Box-floor coupon: printed beside it in the production orientation.
    translate([(coupon_w+gap)/2,0,0])
        difference() {
            rounded_plate([coupon_w,coupon_h],3,rear_floor);
            translate([0,0,-eps])
                cylinder(d=m3_clearance,h=rear_floor+2*eps);
            translate([0,0,-eps])
                cylinder(d=box_register_d+2*box_register_clearance,
                         h=box_register_h+eps);
        }
}

module service_cover() {
    cover_w = rear_box_w - 2*cover_clearance;
    cover_h = rear_box_h - 2*cover_clearance;
    difference() {
        rounded_plate([cover_w,cover_h], rear_box_r-0.5, cover_t);
        cover_screw_positions()
            translate([0,0,-eps])
                cylinder(d=m3_clearance,h=cover_t+2*eps);
        // Two groups of six 20 x 2 mm downward-sheltered slots.
        for (gx=[-38,38])
            for (i=[-2.5:1:2.5])
                translate([gx,i*5,-eps])
                    rounded_plate([20,2],1,cover_t+2*eps);
        // Cable recess at the lower edge.
        translate([0,-cover_h/2,-eps])
            cube([cable_entry_w,5,cover_t+2*eps],center=true);
    }
    // Low rain/condensation eyebrows on the outside of each slot group.
    for (gx=[-38,38])
        for (i=[-2.5:1:2.5])
            translate([gx,i*5+2,cover_t])
                cube([22,1.2,1.2],center=true);
}

module radar_clip() {
    inner_w = radar_w + 2*radar_clearance;
    inner_d = radar_d + radar_clearance;
    difference() {
        union() {
            cube([inner_w+2*radar_clip_t,radar_h+4,radar_clip_t],
                 center=true);
            for (x=[-(inner_w/2+radar_clip_t/2),
                     inner_w/2+radar_clip_t/2])
                translate([x,0,inner_d/2])
                    cube([radar_clip_t,radar_h,inner_d],
                         center=true);
            // Snap lips.
            for (x=[-(inner_w/2-0.5),inner_w/2-0.5])
                translate([x,0,inner_d])
                    cube([2,radar_h,1.2],center=true);
        }
        for (x=[-(inner_w/2+radar_clip_t),inner_w/2+radar_clip_t])
            translate([x,0,-radar_clip_t])
                cylinder(d=m3_clearance,h=3*radar_clip_t);
    }
}

module vent_slots(depth) {
    // Side and lower slots only; no upward-facing openings.
    for (x=[-10,-5,0,5,10])
        translate([x,-bme_h/2-eps,bme_h/2])
            cube([bme_slot_w,bme_wall+2*eps,14],center=true);
    for (side=[-1,1])
        for (y=[-9,-4,1,6])
            translate([side*(bme_w/2),y,bme_h/2])
                cube([bme_wall+2*eps,bme_slot_w,12],center=true);
}

module bme_pod() {
    difference() {
        // Print with vented face on the bed and the rear open.
        rounded_plate([bme_w,bme_h],3,bme_d);
        translate([0,0,bme_wall])
            rounded_plate([bme_w-2*bme_wall,bme_h-2*bme_wall],
                          1.5,bme_d);
        vent_slots(bme_d);
        // Downward cable opening.
        translate([0,-bme_h/2,bme_d-5])
            rotate([90,0,0]) cylinder(d=5,h=2*bme_wall,center=true);
    }
    // Four edge clips locate a nominal 21 x 21 mm breakout.
    for (x=[-(bme_pocket_w/2+1),bme_pocket_w/2+1])
        for (y=[-7,7])
            translate([x,y,bme_wall])
                cube([2,5,bme_pocket_d],center=false);
}

module bme_cover() {
    difference() {
        rounded_plate([bme_w-0.6,bme_h-0.6],2.5,bme_cover_t);
        for (x=[-9,0,9])
            translate([x,-bme_h/2,-eps])
                cube([bme_slot_w,8,bme_cover_t+2*eps],center=true);
        translate([0,-bme_h/2,-eps])
            cube([5,6,bme_cover_t+2*eps],center=true);
    }
}

module dimension_gauge() {
    gauge_w = bezel_w;
    gauge_h = bezel_h;
    difference() {
        rounded_plate([gauge_w,gauge_h],bezel_r,2);
        translate([0,4,-eps])
            rounded_plate([display_recess_w,display_recess_h],3,2+2*eps);
        display_mount_positions()
            translate([0,4,-eps]) cylinder(d=m3_clearance,h=2+2*eps);
    }
    // Thin raised panel cut-out witness line.
    translate([0,0,2])
        rounded_ring([panel_cutout_w+0.8,panel_cutout_h+0.8],
                     [panel_cutout_w-0.8,panel_cutout_h-0.8],
                     panel_corner_r,0.4);
}

module bezel_corner() {
    intersection() {
        bezel();
        translate([bezel_w/2-25,bezel_h/2-25,0])
            cube([50,50,bezel_t]);
    }
}

module radar_test() {
    intersection() {
        bezel();
        translate([-30,-bezel_h/2,0])
            cube([60,32,bezel_t]);
    }
}

module assembly() {
    color("#30343b") bezel();
    color("#667085") translate([0,0,8]) carrier();
    color("#3d4755")
        translate([0,0,8+box_mount_height+box_register_h])
            rear_box();
    color("#596579")
        translate([0,0,8+box_mount_height+box_register_h+
                         rear_internal_depth+rear_floor+4])
            service_cover();
    color("#36684a") translate([125,0,0]) bme_pod();
    color("#667b8d") translate([125,0,bme_d+3]) bme_cover();
}

// Single multi-shell STL for spatial review only. It is not arranged or
// joined for printing: production parts must still be exported separately.
module design_review_layout() {
    assembly();
    color("#8a6470")
        translate([124,-52,radar_clip_t/2])
            radar_clip();
}

if (part == "bezel") bezel();
else if (part == "carrier") carrier();
else if (part == "rear_box") rear_box();
else if (part == "service_cover") service_cover();
else if (part == "box_interface_coupon") box_interface_coupon();
else if (part == "radar_clip") radar_clip();
else if (part == "bme_pod") bme_pod();
else if (part == "bme_cover") bme_cover();
else if (part == "dimension_gauge") dimension_gauge();
else if (part == "bezel_corner") bezel_corner();
else if (part == "radar_test") radar_test();
else if (part == "design_review_layout") design_review_layout();
else assembly();
