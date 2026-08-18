// Windows: no console window behind the game in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    maizes_lib::run()
}
